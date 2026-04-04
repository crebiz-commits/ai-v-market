const { spawn } = require('child_process');
const fs = require('fs');
const fd = fs.openSync('git_debug_log.txt', 'w');

function run(cmd, args) {
    return new Promise((resolve) => {
        const proc = spawn(cmd, args, { shell: true });
        proc.stdout.on('data', (data) => fs.writeSync(fd, `STDOUT: ${data}\n`));
        proc.stderr.on('data', (data) => fs.writeSync(fd, `STDERR: ${data}\n`));
        proc.on('close', (code) => {
            fs.writeSync(fd, `CLOSE: ${code}\n`);
            resolve();
        });
        setTimeout(() => {
            fs.writeSync(fd, `TIMEOUT: ${cmd} ${args.join(' ')}\n`);
            proc.kill();
            resolve();
        }, 10000);
    });
}

(async () => {
    await run('git', ['remote', '-v']);
    await run('git', ['status', '--porcelain']);
    await run('git', ['log', '-1', '--oneline']);
    fs.closeSync(fd);
})();
