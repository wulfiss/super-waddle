const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let validUrl = false;
try { validUrl = new URL(url).protocol === 'https:'; } catch {}
let publicKey = key?.startsWith('sb_publishable_') ?? false;
if (key?.split('.').length === 3) {
 try { publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon'; } catch {}
}
if (!validUrl || !publicKey) {
 console.error('Production requires PUBLIC_SUPABASE_URL (HTTPS) and PUBLIC_SUPABASE_PUBLISHABLE_KEY (publishable or legacy anon key). Never use a service-role or secret key.');
 process.exit(1);
}
console.log('Production Supabase configuration present.');
