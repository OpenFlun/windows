import { path, fs, exec, getDirname } from './shared.js';
import { platform, tmpdir } from 'os';

const __dirname = getDirname(import.meta.url), vbsPath = path.resolve(__dirname, '../bin/elevate.vbs'),
    /** 参数处理函数,用于标准化 options 和 callback 参数 */
    _params = (options = {}, callback) => {
        callback = callback || function () { };
        if (typeof options === 'function') callback = options, options = {};
        if (typeof options !== 'object') throw '参数 options 无效。';
        return { options, callback };
    },

    // 文件读取
    readFileSafe = (Path, value = '') => {
        try {
            return fs.readFileSync(Path, 'utf8');
        } catch (e) { return value; }
    };

/**
 * @method elevate
 * @member flun-windows
 * elevate 类似于 Linux/Mac 上的 `sudo`;它会尝试将当前用户的权限提升为本地管理员;
 * 使用此方法不需要密码,但要求当前用户具有管理员权限;
 * 若无管理员权限,命令将失败并返回 `access denied` 错误;
 *
 * UAC弹窗会提示用户是否允许继续：
 * 语法：`elevate(cmd[, options][, callback])`
 * @param {String} cmd 要使用提升权限执行的命令;可以是任何在命令行中输入的字符串;
 * @param {Object} [options]
  * 将传递给 `child_process.exec` 的任何选项（参考 Node.js 文档）；
 * @param {Function} [callback]
 * 传递给 `exec`（同上）的回调函数;
 */
const elevate = (cmd, options, callback) => {
    const p = _params(options, callback), tmpDir = tmpdir(),
        [vbsFile, outFile, batFile, cmdFile] = ['flun_el.vbs', 'flun_el_output.txt', 'flun_el.bat', 'flun_el.cmd']
            .map(name => path.join(tmpDir, name)),
        escapedCmd = cmd.replace(/"/g, '""').replace(/%/g, "%%"), vbs = readFileSafe(vbsPath).replace(/{command}/g, escapedCmd);

    // 写入VBS文件
    try {
        fs.writeFileSync(vbsFile, vbs, 'utf8');
    } catch (writeError) {
        return p.callback(writeError, '', '');
    }

    exec(`wscript.exe "${vbsFile}"`, { timeout: 20000 }, error => {
        setTimeout(() => {
            const output = readFileSafe(outFile).replace(/\r\n$|\n$/, '').trim();

            // 清理临时文件
            [batFile, cmdFile, outFile, vbsFile].forEach(f => {
                try { fs.unlinkSync(f) } catch (e) { }
            });

            if (error) return p.callback(error, '', '');
            p.callback(null, output, '');
        }, 1600);
    });
};

/**
 * @method sudo
 * @member flun-windows
 * sudo 与 Linux/Mac 上的 `sudo` 不同(UAC弹窗为必须项);
 * sudo 与 _elevate_ 相似,但体验更好(可以设置不同的交互方式,且稳定性更好);
 * 同样,也会弹窗 UAC提示用户是否允许继续(安全操作规范),也要求用户具有管理员权限,否则命令将失败;
 *
 * 语法：`sudo(cmd[, options][, callback])`
 * 参数同elevate方法...;
 */
const sudo = (cmd, options, callback) => {
    const p = _params(options, callback);
    exec(`sudo ${cmd}`, p.options, p.callback);
};

/**
 * @method isAdminUser 此异步命令用于判断当前用户是否拥有管理员权限;
 * @member flun-windows
 * 它会向回调函数传递一个布尔值,如果用户是管理员则返回 `true`,否则返回 `false`;
 * @param {Function} callback
 * @param {Boolean} callback.isAdmin 回调函数接收 true/false 作为参数;
 */
const isAdminUser = callback => {
    exec('NET SESSION', (err, so, se) => {
        if (se.length !== 0) elevate('NET SESSION', (_err, _so, _se) => callback(_se.length === 0));
        else callback(true);
    });
};

export { elevate, sudo, isAdminUser, platform };