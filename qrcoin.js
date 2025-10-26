/**
 * =====================================================
 * QRCOIN FARCASTER AUTO-CLAIM SCRIPT
 * =====================================================
 * Jalankan dengan argumen opsional:
 *   node qrcoin.js --auction 200 --min 1000
 * =====================================================
 */

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const {
    Wallet,
    JsonRpcProvider,
    AbiCoder,
    parseUnits,
    getBytes,
} = require("ethers");

// --------------------- ARGUMEN CLI ---------------------
const args = process.argv.slice(2);
function getArg(flag, def) {
    const idx = args.indexOf(flag);
    if (idx !== -1 && args[idx + 1]) {
        const val = args[idx + 1];
        if (!isNaN(val)) return Number(val);
    }
    return def;
}

// nilai default bisa diubah di sini
const AUCTION_ID = getArg("--auction", 150);
const MIN_AMOUNT_TOKEN = getArg("--min", 1000);

// --------------------- KONFIGURASI ---------------------
const PRIVY_APP_ID = "cma1g93r3007qjm0nhofat49w";
const PRIVY_CA_ID = "7d0f5a6e-2a94-40e0-b958-0b1bb51acda1";
const PRIVY_CLIENT = "react-auth:2.14.0";
const ORIGIN = "https://qrcoin.fun";

const SIWE_URI = "https://qrcoin.fun/";
const SIWE_VERSION = "1";
const SIWE_CHAINID = 10;

const EXPECTED_CHAIN_ID = 8453;

const RPC_CANDIDATES = [
    "https://mainnet.base.org",
    "https://base.llamarpc.com",
    "https://base-rpc.publicnode.com",
];

const API_BASE = "https://qrcoin.fun";
const X_API_KEY =
    "7928227064ff5fbd952120a972e3887d0dc88e9186a21e8c2ced7aa68068fd1c";
const CLIENT_FID = 9152;

const WINNING_URL = `${API_BASE}/auction/${AUCTION_ID}`;

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 10000;
const MINIAPP_REFRESH_DELAY_MS = 1500;

const FN_SELECTOR = "0x86edf11c";
const abi = new AbiCoder();

// --------------------- UTILITAS ---------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readPkFidList(file = path.join(__dirname, "pkfid.txt")) {
    if (!fs.existsSync(file)) {
        console.error(`File pkfid.txt tidak ditemukan: ${file}`);
        process.exit(1);
    }

    return fs
        .readFileSync(file, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map((line) => {
            const [pk, fidStr] = line.split("|").map((s) => s.trim());
            const fid = parseInt(fidStr, 10);
            if (!pk || !pk.startsWith("0x") || pk.length < 66 || !Number.isInteger(fid)) {
                throw new Error(`Format salah. Gunakan "0xPRIVATE_KEY|FID": ${line}`);
            }
            return { pk, fid };
        });
}

function buildSiweMessage(address, fid, nonce) {
    const issuedAt = new Date().toISOString();
    return `qrcoin.fun wants you to sign in with your Ethereum account:
${address}

Farcaster Auth

URI: ${SIWE_URI}
Version: ${SIWE_VERSION}
Chain ID: ${SIWE_CHAINID}
Nonce: ${nonce}
Issued At: ${issuedAt}
Resources:
- farcaster://fid/${fid}`;
}

function extractUsernameFromAuth(authData) {
    const linked = authData?.user?.linked_accounts || [];
    const fc = linked.find((x) => x.type === "farcaster");
    return fc?.username || null;
}

function makeQrcoinHeaders({ token, identity_token }) {
    if (!token) throw new Error("Auth token kosong dari Privy.");
    if (!identity_token) throw new Error("Identity token kosong dari Privy.");
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-api-key": X_API_KEY,
        "x-privy-id-token": identity_token,
    };
}

// --------------------- HTTP HELPERS ---------------------
async function httpPostRetry(url, body, headers) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await axios.post(url, body, { headers, timeout: 30000 });
        } catch (err) {
            const status = err.response?.status;
            const data = err.response?.data || {};
            const msg = (data.error || data.message || err.message || "").toLowerCase();
            const retryable =
                status === 429 || status === 503 || status >= 500 || msg.includes("rate") || msg.includes("busy");
            if (retryable && attempt < MAX_RETRIES) {
                console.warn(`POST gagal (${status || err.code}). Coba lagi ${attempt}/${MAX_RETRIES} dalam ${RETRY_DELAY_MS / 1000}s...`);
                await sleep(RETRY_DELAY_MS);
            } else {
                throw err;
            }
        }
    }
}

async function httpGetRetry(url, headers) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await axios.get(url, { headers, timeout: 30000 });
        } catch (err) {
            const status = err.response?.status;
            const data = err.response?.data || {};
            const msg = (data.error || data.message || err.message || "").toLowerCase();
            const retryable =
                status === 429 || status === 503 || status >= 500 || msg.includes("rate") || msg.includes("busy");
            if (retryable && attempt < MAX_RETRIES) {
                console.warn(`GET gagal (${status || err.code}). Coba lagi ${attempt}/${MAX_RETRIES} dalam ${RETRY_DELAY_MS / 1000}s...`);
                await sleep(RETRY_DELAY_MS);
            } else {
                throw err;
            }
        }
    }
}

// --------------------- PRIVY AUTH ---------------------
async function privyInitNonce() {
    const res = await httpPostRetry(
        "https://auth.privy.io/api/v2/farcaster/init",
        {},
        {
            "Content-Type": "application/json",
            accept: "application/json",
            "privy-app-id": PRIVY_APP_ID,
            "privy-ca-id": PRIVY_CA_ID,
            "privy-client": PRIVY_CLIENT,
            origin: ORIGIN,
        }
    );
    if (!res.data?.nonce) throw new Error("Gagal mengambil nonce dari Privy.");
    return res.data;
}

async function privyAuthenticate({ message, signature, fid }) {
    const res = await httpPostRetry(
        "https://auth.privy.io/api/v2/farcaster/authenticate",
        { message, signature, fid },
        {
            "Content-Type": "application/json",
            accept: "application/json",
            "privy-app-id": PRIVY_APP_ID,
            "privy-ca-id": PRIVY_CA_ID,
            "privy-client": PRIVY_CLIENT,
            origin: ORIGIN,
        }
    );
    return res.data;
}

// --------------------- QRCOIN ENDPOINTS ---------------------
async function getCheckClaims({ headers, fid }) {
    const url = `${API_BASE}/api/link-visit/check-claims?auctionId=${AUCTION_ID}&fid=${fid}&claimSource=mini_app`;
    try {
        const res = await httpGetRetry(url, headers);
        return res.data;
    } catch (err) {
        console.warn("Gagal cek klaim:", err.response?.data || err.message);
        return null;
    }
}

async function miniAppAuth({ headers, fid, address, username }) {
    const res = await httpPostRetry(
        `${API_BASE}/api/miniapp-auth`,
        { fid, address, username, clientFid: CLIENT_FID },
        headers
    );
    if (!res.data?.success) throw new Error(`miniapp-auth gagal: ${JSON.stringify(res.data)}`);
    return res.data.token;
}

async function claimSignature({ headers, fid, address, username, miniapp_token }) {
    const res = await httpPostRetry(
        `${API_BASE}/api/link-visit/claim-signature`,
        {
            fid,
            address,
            auction_id: AUCTION_ID,
            username,
            winning_url: WINNING_URL,
            claim_source: "mini_app",
            client_fid: CLIENT_FID,
            miniapp_token,
        },
        headers
    );
    return res.data;
}

async function confirmClaim({ headers, payload }) {
    const res = await httpPostRetry(`${API_BASE}/api/link-visit/confirm-claim`, payload, headers);
    return res.data;
}

// --------------------- PROVIDER ---------------------
async function getHealthyProvider() {
    for (const url of RPC_CANDIDATES) {
        try {
            const provider = new JsonRpcProvider(url);
            const net = await provider.getNetwork();
            if (Number(net.chainId) !== EXPECTED_CHAIN_ID) continue;
            await provider.getBlockNumber();
            return provider;
        } catch (_) { }
    }
    throw new Error("Tidak ada RPC Base yang sehat.");
}

async function estimateAndSend(provider, wallet, to, data) {
    try {
        const fee = await provider.getFeeData();
        const tx = await wallet.sendTransaction({
            to,
            data,
            value: 0,
            maxFeePerGas: fee.maxFeePerGas ?? undefined,
            maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? undefined,
        });
        return tx;
    } catch (e) {
        throw new Error(`Gagal kirim transaksi: ${e.message}`);
    }
}

// --------------------- BUILD CALLDATA ---------------------
function buildCalldataFromSignature(sigObj) {
    const amountWei = parseUnits(String(sigObj.amount || "0"), 18);
    const fid = BigInt(sigObj.fid || "0");
    const auctionId = BigInt(sigObj.auctionId || "0");
    const deadline = BigInt(sigObj.deadline || "0");

    const sigBytes = getBytes(sigObj.signature);
    if (sigBytes.length !== 65) {
        throw new Error(`Signature length tidak valid (${sigBytes.length}).`);
    }

    const data =
        FN_SELECTOR +
        abi
            .encode(
                ["address", "address", "uint256", "uint256", "uint256", "uint256", "bytes"],
                [
                    sigObj.escrow,
                    sigObj.recipient,
                    amountWei,
                    fid,
                    auctionId,
                    deadline,
                    sigObj.signature,
                ]
            )
            .slice(2);

    return { to: sigObj.contract, data };
}

// --------------------- IP RANDOM ---------------------
function randByte() {
    return Math.floor(Math.random() * 256);
}

function randomPublicIPv4() {
    while (true) {
        const a = randByte(), b = randByte(), c = randByte(), d = randByte();
        const isPrivate =
            a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
        const isLoopback = a === 127;
        const isLinkLocal = a === 169 && b === 254;
        const isMulticast = a >= 224 && a <= 239;
        const isReserved =
            a === 0 || a === 100 || a === 198 || a === 203 || a === 255;
        if (!(isPrivate || isLoopback || isLinkLocal || isMulticast || isReserved)) {
            return `${a}.${b}.${c}.${d}`;
        }
    }
}

// --------------------- MAIN SCRIPT ---------------------
async function run() {
    console.log(`Menggunakan auction ID: ${AUCTION_ID}`);
    console.log(`Minimum token claim: ${MIN_AMOUNT_TOKEN}\n`);

    const provider = await getHealthyProvider();
    console.log("Terkoneksi ke Base RPC");

    const list = readPkFidList();
    let totalClaimedTokens = 0;

    for (const { pk, fid } of list) {
        console.log(`\nProses FID ${fid}`);

        const wallet = new Wallet(pk, provider);
        const address = await wallet.getAddress();
        console.log(`Alamat: ${address}`);

        // Privy login
        const { nonce } = await privyInitNonce();
        const message = buildSiweMessage(address, fid, nonce);
        const signature = await wallet.signMessage(message);
        const auth = await privyAuthenticate({ message, signature, fid });
        const headers = makeQrcoinHeaders(auth);
        const username = extractUsernameFromAuth(auth) || `fid_${fid}`;
        console.log(`Login sebagai @${username}`);

        // Cek klaim
        const pre = await getCheckClaims({ headers, fid });
        const already =
            pre?.claimed || pre?.data?.claimed || pre?.result?.claimed || pre?.hasClaimed;
        if (already) {
            console.log("Sudah klaim. Lewati.");
            continue;
        }

        await sleep(MINIAPP_REFRESH_DELAY_MS);
        const miniapp_token = await miniAppAuth({ headers, fid, address, username });

        const claimRes = await claimSignature({
            headers, fid, address, username, miniapp_token
        });

        if (!claimRes?.success || !claimRes?.signature) {
            console.error("Claim-signature gagal:", claimRes);
            continue;
        }

        const sigObj = claimRes.signature;
        const amount = Number(sigObj.amount || 0);
        if (!Number.isFinite(amount)) {
            console.log("Amount tidak valid. Lewati.");
            continue;
        }
        if (amount < MIN_AMOUNT_TOKEN) {
            console.log(`Amount ${amount} di bawah minimum ${MIN_AMOUNT_TOKEN}. Lewati.`);
            continue;
        }

        const { to, data } = buildCalldataFromSignature(sigObj);
        console.log("Mengirim transaksi...");

        let txHash = null;
        try {
            const tx = await estimateAndSend(provider, wallet, to, data);
            txHash = tx.hash;
            console.log(`TX Hash: https://basescan.org/tx/${txHash}`);
            await tx.wait();
            totalClaimedTokens += amount;
        } catch (err) {
            console.error("Gagal kirim transaksi:", err.message);
            continue;
        }

        try {
            const payload = {
                tx_hash: txHash,
                address,
                auction_id: AUCTION_ID,
                fid,
                username,
                winningUrl: WINNING_URL,
                claimSource: "mini_app",
                clientIp: randomPublicIPv4(),
            };
            const confirmRes = await confirmClaim({ headers, payload });
            console.log(`${confirmRes.message} - Amount: ${confirmRes.amount}QR`);
        } catch (err) {
            console.warn("Gagal konfirmasi ke server:", err.message);
        }

        const post = await getCheckClaims({ headers, fid });
        const nowClaimed =
            post?.claimed || post?.data?.claimed || post?.result?.claimed || post?.hasClaimed;
        console.log(`Status setelah klaim: ${nowClaimed ? "sudah" : "belum"}`);
    }

    console.log("\n================= HASIL =================");
    console.log(`Total token berhasil diklaim: ${totalClaimedTokens}`);
    console.log("Selesai");
}

run().catch((e) => {
    console.error("FATAL:", e.message);
    process.exit(1);
});
