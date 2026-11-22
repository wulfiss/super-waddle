// Use Vercel's build metadata so a public browser setting cannot enable the demo.
/** @param {Record<string, string | undefined>} env */
export function isHostedDemo(env) {
 return env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === 'feature/registro-rapido-ui';
}
