import { path, fs, exec, getDirname } from './shared.js';
/**
 * 从 Node.js `os` 模块导入的 `platform` 函数,用于获取操作系统平台字符串;
 * >查看定义:@see {@link platform}
 * @type {() => string}
 */
import { platform, tmpdir } from 'os';

const __dirname = getDirname(import.meta.url), vbsPath = path.resolve(__dirname, '../bin/elevate.vbs'),
    /** 参数处理函数,用于标准化 options 和 callback 参数 */
    _params = (options = {}, callback) => {
        callback = callback || function () { };
        if (typeof options === 'function') callback = options, options = {};
        if (typeof options !== 'object') throw '参数 options 无效;';
        return { options, callback };
    },

    // 文件读取
    readFileSafe = (Path, value = '') => {
        try {
            return fs.readFileSync(Path, 'utf8');
        } catch (e) { return value; }
    };

/**
 * 提升当前进程权限（Windows UAC）
 * >查看定义:@see {@link elevate}
 * @param {string} cmd - 要使用提升权限执行的命令
 * @param {Object} [options] - 传递给 child_process.exec 的选项
 * @param {string} [options.cwd] - 工作目录
 * @param {number} [options.timeout] - 超时时间（毫秒）
 * @param {(error: Error|null, stdout: string, stderr: string) => void} [callback] - 执行完成后的回调函数
 * @returns {void}
 * @example
 * import { elevate  } from '@flun/windows';
 *
 * // 基本用法
 * elevate('echo "Hello World" && whoami',{}, (error, stdout, stderr) => {
 *     if (error) {
 *         console.error('执行失败:', error);
 *     } else {
 *         console.log('执行成功,输出:', stdout);
 *         console.log('错误输出:', stderr);
 *     }
 * });
 *
 * // 带选项参数
 * elevate('echo "Hello World" && whoami', { cwd:'C:\\' }, callback);
 *
 * // 多种参数组合
 * elevate('echo "Hello World" && whoami', (err, stdout)=> { }); // options视为回调
 * elevate('echo "Hello World" && whoami'); // 无回调
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
 * 使用 sudo 方式提升权限（与 elevate 相似但体验更好）
 * >查看定义:@see {@link sudo}
 * @param {string} cmd - 要使用提升权限执行的命令
 * @param {Object} [options] - 传递给 child_process.exec 的选项
 * @param {string} [options.cwd] - 工作目录
 * @param {number} [options.timeout] - 超时时间（毫秒）
 * @param {(error: Error|null, stdout: string, stderr: string) => void} [callback] - 执行完成后的回调函数
 * @returns {void}
 * @example
 * import { sudo } from '@flun/windows';
 *
 * // 基本用法 - 命令、选项和回调
 * sudo('echo "Hello World" && whoami', {}, (error, stdout, stderr) => {
 *     if (error) {
 *         console.error('执行失败:', error);
 *     } else {
 *         console.log('执行成功,输出:', stdout);
 *         console.log('错误输出:', stderr);
 *     }
 * });
 *
 * // 带选项参数
 * sudo('echo "Hello World" && whoami', {cwd:'C:\\'}, callback);
 *
 * sudo('echo "Hello World" && whoami' ); // 无回调
 */
const sudo = (cmd, options, callback) => {
    const p = _params(options, callback);
    exec(`sudo ${cmd}`, p.options, p.callback);
};

/**
 * 检查当前用户是否拥有管理员权限
 * >查看定义:@see {@link isAdminUser}
 * @param {(isAdmin: boolean) => void} callback - 回调函数,接收布尔值表示是否为管理员
 * @returns {void}
 * @example
 * import { isAdminUser  } from '@flun/windows';
 * isAdminUser(isAdmin => {
 *   if (isAdmin) console.log('当前用户是管理员');
 *   else console.log('当前用户不是管理员');
 * });
 */
const isAdminUser = callback => {
    exec('NET SESSION', (err, so, se) => {
        if (se.length !== 0) elevate('NET SESSION', (_err, _so, _se) => callback(_se.length === 0));
        else callback(true);
    });
};

export { elevate, sudo, isAdminUser, platform };