import { exec } from './shared.js';

/**
 * 结束指定进程
 * >查看定义:@see {@link kill}
 * @param {number} pid - 进程PID
 * @param {(error: Error|null, stdout: string, stderr: string) => void} [callback] - 执行完成后的回调函数
 * @param {boolean} [force=false] - 是否强制结束进程（默认: false）
 * @returns {void}
 * @example
 * import { kill } from 'flun-windows';
 *  kill(进程PID, () => {
 *    console.log('进程已终止');
 *  });
 */
const kill = (pid, callback, force = false) => {
  if (!pid) throw new Error('PID是kill操作必需的参数。');
  if (isNaN(pid)) throw new Error('PID必须为数字。');
  if (typeof callback !== 'function') callback = function () { };
  exec(`taskkill /PID ${pid}${force == true ? ' /f' : ''}`, callback);
};

/**
 * 列出服务器上正在运行的进程
 * >查看定义:@see {@link list}
 * @param {(processes: Array<Record<string, string>>) => void} callback - 回调函数,接收进程对象数组
 * @param {boolean} [verbose=false] - 是否显示详细信息（默认: false）
 * @returns {void}
 * @example
 * import { list } from 'flun-windows';
 *  list(processes => {
 *    console.log(processes);
 *  }, true); // true 显示详细信息
 */
const list = (callback, verbose = false) => {
  exec(`tasklist /FO CSV${verbose ? ' /V' : ''}`, (err, stdout, stderr) => {
    const lines = stdout.split('\r\n'), processes = [],
      commaQuoteRegex = /",/g, quoteRegex = /['"]/g, whitespaceRegex = /\s/g; // 预编译正则表达式(匹配 CSV 格式)
    let headers = null;
    for (const line of lines.slice(1, -1)) {
      if (!line.trim()) continue;  // 跳过空行
      // 替换 CSV 中的字段分隔符,移除所有引号
      let record = line.replace(commaQuoteRegex, '";').replace(quoteRegex, '').split(';');
      if (!headers) headers = record.map(header => header.replace(whitespaceRegex, ''));
      else {
        const processObj = {};
        record.forEach((value, index) => processObj[headers[index]] = value.replace(quoteRegex, ''));
        processes.push(processObj);
      }
    }
    callback(processes);
  });
}
export { kill, list };