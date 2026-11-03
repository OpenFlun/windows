/**
 * Windows 服务配置模板
 * 带 * 的为必填项,其余可删除或按需保留;
 * 本配置既支持命令行方式(如 windows install),
 * 也支持在函数方式中导入:import config from './win-service.config.js';
 * 具体用法见 README 的「命令行」与「函数方式」章节;
 *
 * 关于 quiet:默认 false,各方法执行后会在终端打印结果(如"服务安装完成;");
 * 若本包嵌入到自己的生产项目,终端输出会混入宿主日志,此时设为 true,
 * 库只发事件不打印,由宿主自行监听 install/start/stop/uninstall/error 等事件;
 * 命令行方式恒为 quiet,不受此字段影响;
 */
export default {
  // * 服务名称,用于服务管理与注册表标识;不能含 <>:"\/|?*
  name: 'MyApp',
  // * 启动服务的入口脚本绝对路径
  script: 'C:\\path\\to\\main.js',

  // 服务描述,显示在服务管理器中
  description: 'Node.js 服务',
  // 传递给 node 进程的选项,可为数组或空格分隔的字符串
  nodeOptions: ['--harmony'],
  // 传递给脚本的选项
  scriptOptions: '',
  // node 可执行文件路径,默认取当前进程的 execPath
  execPath: process.execPath,
  // 服务工作目录,默认取当前工作目录
  workingDirectory: process.cwd(),

  // 无响应/故障前的最大重试次数,默认 null(不启用)
  maxRetries: null,
  // 60 秒内最大重启次数,0 表示不启用,默认 3
  maxRestarts: 3,
  // 停止服务的超时秒数,默认 30
  stoptimeout: 30,
  // 脚本停止后等待重启的秒数,默认 1
  wait: 1,
  // 重启等待时间的增长百分比,默认 0.25
  grow: 0.25,
  // 脚本运行错误时是否退出进程,默认 false
  abortOnError: false,
  // 是否先停止父进程,默认 false
  stopparentfirst: false,

  // 日志文件路径,默认与可执行文件同目录
  logpath: null,
  // 日志模式:rotate(默认)、truncate、append
  logmode: 'rotate',

  // 环境变量,形式为 { name, value } 或同构数组
  env: { name: 'NODE_ENV', value: 'production' },

  // 日志配置对象,可替代 logmode;含 mode、pattern、sizeThreshold、keepFiles
  logging: undefined,

  // 服务登录凭据;默认使用 LocalSystem
  logOnAs: {
    account: undefined,
    password: null,
    domain: process.env.COMPUTERNAME,
    mungeCredentialsAfterInstall: true,
  },
  // 是否允许服务登录,默认 undefined
  allowServiceLogon: undefined,

  // 为 true 时不打印执行结果,只发事件;嵌入生产项目时建议开启
  quiet: false,
};