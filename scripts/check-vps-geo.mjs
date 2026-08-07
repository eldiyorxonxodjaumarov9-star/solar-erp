/** VPS da joylashuv endpoint ishlayotganini tekshirish */
const base = (process.argv[2] || "http://77.237.237.94").replace(/\/+$/, "");

async function check(path) {
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const text = await res.text();
    console.log(`${res.status} ${path}`);
    console.log(text.slice(0, 400));
  } catch (e) {
    console.log(`ERR ${path}:`, e.message || e);
  }
  console.log("---");
}

console.log("VPS:", base);
await check("/status");
await check("/api/geo/approx");
