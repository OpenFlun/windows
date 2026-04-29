import { fs, path, getDirname } from './shared.js';
import xmlBuilder from 'xml';


const __dirname = getDirname(import.meta.url);
/**
 * @method generateXml 生成 winsw 配置文件的 XML;
 * @param {Object} config - 配置对象,必须包含以下必需属性：
 *   - *id* 服务的标识符,只能包含字母和数字,不能有空格
 *   - *name* 服务的描述性名称
 *   - *execPath* Node.js 可执行文件的绝对路径（如：C:\Program Files\nodejs\node.exe）
 *   - *script* Node.js 服务器脚本的绝对路径（包装脚本）
 *   - *workingdirectory* 服务运行的工作目录
 * @param {string} [config.description] - 在服务管理器中显示的描述信息
 * @param {string|string[]} [config.nodeOptions] - Node.js 选项（数组或空格分隔的字符串）
 * @param {string} [config.wrapperArgs] - 传递给包装脚本的额外参数
 * @param {string} [config.logmode] - 日志模式(老式):'rotate'(默认), 'reset', 'roll', 'append'
 * @param {Object} [config.logging] - 日志配置对象,可替代 logmode
 * @param {string} [config.logging.mode] - 日志模式(现代),支持 'append', 'reset', 'none', 'roll-by-time', 'roll-by-size'
 * @param {string} [config.logging.pattern] - roll-by-time 模式的时间格式模式（默认:'yyyyMMdd'）
 * @param {number} [config.logging.sizeThreshold] - roll-by-size 模式的大小阈值（默认:10240）
 * @param {number} [config.logging.keepFiles] - roll-by-size 模式保留的文件数（默认:8）
 * @param {string} [config.logpath] - 日志存储目录的绝对路径（默认:当前目录）
 * @param {string|string[]} [config.dependencies] - 进程依赖项的逗号分隔列表或数组
 * @param {{ name: string, value: string }[]|Object<string, string>} [config.env] - 环境变量配置（键/值对象或对象数组）
 * @param {Object} [config.logOnAs] - 服务登录凭据配置
 * @param {string} [config.logOnAs.account] - 登录账户名
 * @param {string} [config.logOnAs.password] - 登录密码
 * @param {string} [config.logOnAs.domain] - 账户所在域
 * @param {boolean} [config.allowServiceLogon] - 是否允许服务登录
 * @param {boolean} [config.stopparentfirst] - 是否先停止父进程
 * @param {number} [config.stoptimeout] - 停止超时时间（秒）
 * @returns {string} 生成的 XML 字符串
 * @throws {string} 当缺少必需配置时抛出错误
 */
const generateXml = config => {
  const {
    id, name, script, description = '', nodeOptions, wrapperArgs, logmode = 'rotate', logging, logpath, dependencies,
    env, logOnAs, allowServiceLogon, workingdirectory, stopparentfirst, stoptimeout, execPath
  } = config;

  // 验证必需配置项是否存在
  if (!id || !name || !script || !execPath || !workingdirectory) throw "id,name,script,execPath,workingdirectory为必需配置项";

  let xml = [{ id }, { name }, { description }, { executable: execPath }]; // 基础 XML 结构

  // 多值处理
  const multi = (tag, input, splitter = ',') => {
    if (!input) return;
    const items = Array.isArray(input) ? input : input.split(splitter); // 标准化为数组
    items.forEach(val => xml.push({ [tag]: String(val).trim() }));      // 添加到 XML 结构
  };

  multi('argument', nodeOptions, ' ');                    // 添加 Node.js 选项参数
  xml.push({ argument: script.trim() });                  // 添加主脚本路径参数
  multi('argument', wrapperArgs, ' ');                    // 添加包装脚本参数

  // 日志配置处理:优先使用 logging 对象,其次使用 logmode
  if (logging) {
    const { mode = 'append', pattern = 'yyyyMMdd', sizeThreshold = 10240, keepFiles = 8 } = logging, logContent = [{ _attr: { mode } }];
    if (mode === 'roll-by-time') logContent.push({ pattern });               // 按时间滚动日志
    else if (mode === 'roll-by-size') logContent.push({ sizeThreshold }), logContent.push({ keepFiles }); // 按大小滚动日志
    xml.push({ log: logContent });
  }
  else xml.push({ logmode });

  if (logpath) xml.push({ logpath });                                         // 添加日志路径
  if (stopparentfirst) xml.push({ stopparentprocessfirst: stopparentfirst }); // 添加停止父进程优先选项
  if (stoptimeout) xml.push({ stoptimeout: `${stoptimeout} sec` });           // 添加停止超时设置

  multi('depend', dependencies);                                              // 添加依赖项
  env && xml.push(...[].concat(env).map(({ name, value }) => ({ env: { _attr: { name, value } } }))); // 添加环境变量

  // 添加服务登录凭据
  if (logOnAs) {
    const { domain = 'NT AUTHORITY', account = 'LocalSystem', password = '' } = logOnAs,
      serviceaccount = [{ domain }, { user: account }, { password }];
    if (allowServiceLogon) serviceaccount.push({ allowservicelogon: 'true' }); // 允许服务登录
    xml.push({ serviceaccount });
  }

  xml.push({ workingdirectory });                                               // 添加工作目录
  return xmlBuilder({ service: xml }, { indent: '\t' }).replace(/\n/g, '\r\n'); // 格式化为 Windows 风格的换行符
};

/**
 * @method createExe 创建 winsw 可执行文件及其配置文件
 * @param {string} name - 可执行文件名称(不含扩展名);
 * @param {string} dir - 输出目录（默认:当前工作目录）
 * @param {() => void} [callback] - 完成后的回调函数
 * @description 将 winsw.exe 的安装版本复制为根据服务id重命名的特定版本,
 * 并复制 .exe.config 文件以支持 .NET 4+ 运行时环境;
 */
const createExe = (name, dir, callback) => {
  if (!name || !dir) throw "createExe 方法需要 name 和 dir 两个参数!";

  const binaryOptions = { encoding: 'binary' }, basePath = path.join(__dirname, '../bin/winsw'),
    files = [{ src: 'winsw.exe', dest: `${name}.exe` }, { src: 'winsw.exe.config', dest: `${name}.exe.config` }];

  // 复制文件到目标目录
  files.forEach(file => {
    const srcPath = path.join(basePath, file.src), destPath = path.join(dir, file.dest);
    fs.writeFileSync(destPath, fs.readFileSync(srcPath, binaryOptions), binaryOptions);
  });

  callback?.();
};

export { generateXml, createExe };