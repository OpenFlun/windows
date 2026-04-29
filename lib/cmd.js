import { exec } from './shared.js';

/**
 * @method kill 结束指定进程
 * @member flun-windows
 * @param {Number} PID 进程ID
 * @param {Function} [callback]
 * @param {Boolean} [force=false] 是否强制结束进程
 */
const kill = (pid, callback, force = false) => {
  if (!pid) throw new Error('PID是kill操作必需的参数。');
  if (isNaN(pid)) throw new Error('PID必须为数字。');
  if (typeof callback !== 'function') callback = function () { };
  exec(`taskkill /PID ${pid}${force == true ? ' /f' : ''}`, callback);
};

/**
 * @method list 列出服务器上正在运行的进程
 * @member flun-windows
 * @param {Function} callback 接收进程对象作为唯一的回调参数
 * @param {Boolean} [verbose=false] 是否显示详细信息
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