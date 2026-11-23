/* Update the app from the web: Settings → App updates → Update now.
   Pulls the latest version from GitHub, installs packages if they changed,
   rebuilds and restarts. Runs only fixed commands — nothing from the request.
   Turned on when the app folder is a git checkout AND a PIN is set
   (ACCESS_PIN), or ALLOW_WEB_UPDATE=1 is set explicitly. */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MAX_LOG = 20_000;

export function createUpdater(root, { accessPin = '', allow = process.env.ALLOW_WEB_UPDATE === '1', onRestart } = {}) {
  const isGit = fs.existsSync(path.join(root, '.git'));
  const enabled = isGit && (Boolean(accessPin) || allow);
  const managed = process.env.pm_id !== undefined || process.env.ALLOW_SELF_RESTART === '1';
  const job = { state: 'idle', log: '', startedAt: null, finishedAt: null, error: '' };

  const sh = (cmd, args, timeout = 10 * 60_000) =>
    new Promise((resolve, reject) => {
      execFile(cmd, args, { cwd: root, timeout, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, CI: '1' } }, (err, stdout, stderr) => {
        const out = `${stdout || ''}${stderr || ''}`.trim();
        if (err) reject(Object.assign(new Error(out || err.message), { out }));
        else resolve(out);
      });
    });
  const git = (...args) => sh('git', args, 120_000);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const append = (t) => {
    job.log = (job.log + t + '\n').slice(-MAX_LOG);
  };

  async function status({ fetch = false } = {}) {
    if (!isGit) return { enabled: false, reason: 'This copy was not installed with git, so it cannot update itself.' };
    if (!enabled) return { enabled: false, reason: 'Set an ACCESS_PIN on the server to turn on web updates.' };
    const branch = await git('rev-parse', '--abbrev-ref', 'HEAD');
    if (fetch) await git('fetch', '--quiet', 'origin', branch);
    const current = await git('log', '-1', '--format=%h|%cI|%s');
    let behind = 0;
    let latest = current;
    try {
      behind = Number(await git('rev-list', '--count', `HEAD..origin/${branch}`)) || 0;
      latest = await git('log', '-1', '--format=%h|%cI|%s', `origin/${branch}`);
    } catch {
      /* no remote branch yet */
    }
    const split = (l) => {
      const [hash, date, ...msg] = l.split('|');
      return { hash, date, message: msg.join('|') };
    };
    let changes = [];
    if (behind) changes = (await git('log', '--format=%h|%cI|%s', `HEAD..origin/${branch}`, '-20')).split('\n').filter(Boolean).map(split);
    return { enabled: true, branch, current: split(current), latest: split(latest), behind, changes, canRestart: managed, job: { state: job.state, log: job.log, error: job.error, startedAt: job.startedAt, finishedAt: job.finishedAt } };
  }

  async function run() {
    if (!enabled) throw new Error('Web updates are turned off on this server.');
    if (job.state === 'running') return;
    Object.assign(job, { state: 'running', log: '', error: '', startedAt: new Date().toISOString(), finishedAt: null });
    (async () => {
      try {
        const branch = await git('rev-parse', '--abbrev-ref', 'HEAD');
        const before = await git('rev-parse', 'HEAD');
        append('› Downloading the latest version…');
        append(await git('pull', '--ff-only', 'origin', branch));
        const after = await git('rev-parse', 'HEAD');
        const changed = before === after ? [] : (await git('diff', '--name-only', before, after)).split('\n');
        if (changed.some((f) => f === 'package.json' || f === 'package-lock.json') || !fs.existsSync(path.join(root, 'node_modules'))) {
          append('› Installing packages (a minute or two)…');
          append((await sh(npm, ['ci', '--no-audit', '--no-fund'])).split('\n').slice(-5).join('\n'));
        }
        append('› Building the app…');
        append((await sh(npm, ['run', 'build'])).split('\n').slice(-4).join('\n'));
        job.state = 'done';
        job.finishedAt = new Date().toISOString();
        if (managed) {
          append('› Restarting… the page reloads by itself.');
          setTimeout(() => (onRestart ? onRestart() : process.exit(0)), 800);
        } else {
          append('✓ Updated. Restart the app on the server to load the new server code (the pages are already new).');
        }
      } catch (e) {
        job.state = 'error';
        job.error = String(e.message || e).slice(0, 2000);
        job.finishedAt = new Date().toISOString();
        append(`✗ ${job.error}`);
      }
    })();
  }

  return { status, run, enabled };
}
