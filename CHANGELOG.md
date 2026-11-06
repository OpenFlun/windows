# 变更日志

## [4.0.1] - 2026-11-06 10:17
### 优化
- 优化了部分细节;

## [4.0.0] - 2026-11-03 22:34
### 破坏性变更
- `Service#install()` 默认在安装成功后启动服务;旧行为只安装不启动,如需保持旧行为传 `autoStart = false`;
- 移除模板 `sevWin.js`,改为 `win-service.config.js`;详细用法见"README.md";
- 库内执行结果的输出改由 `quiet` 配置控制;嵌入生产环境时建议设为 `true`,避免输出混入宿主日志;

### 新增
- 新增命令行入口 `bin/cli.js`,注册命令 `windows`;支持 `install`、`uninstall`、`start`、`stop`、
  `restart`、`status`、`xml`、`exe`、`list`、`kill`、`log`、`is-admin`、`elevate`、`example`、`help`;
- 新增配置模板 `win-service.config.js`,列全量字段并标注必填项;由 `postinstall` 复制到用户项目根;
- `Service` 新增 `toXml()` 与 `toExe(dir)`,可只生成 winsw 配置或可执行文件而不安装;
- `Service` 新增 `quiet` 配置项,为 `true` 时不打印执行结果,只发事件;
- `install(dir, autoStart = true)` 新增 `autoStart` 参数;

### 修复
- 库内执行结果输出不一致:`install`、`uninstall`、`start`、`stop` 的成功路径统一经 `#report` 输出,
  受 `quiet` 控制;
- `#execute` 在命令失败时无条件打印错误,不受 `quiet` 约束;现改为仅 `quiet` 为 `false` 时打印;
- 配置模板中 `script` 字段的反斜杠被过度转义,解析后得到双反斜杠路径;现修正为单反斜杠;

### 文档
- README 新增「命令行」章节,含快速开始、命令表(按服务类与其它分组)、命令行参数、服务配置;
- README 新增「参考配置」章节,逐字段说明含义与默认值;
- README 函数方式示例改为导入 `win-service.config.js`,并补 `quiet` 说明;

## [3.0.11] - 2026-10-25 15:57
### 优化
- 项目标点已改为以英文标点为主;
- 行宽改为以 123 为主,部分超宽表格改为了列表;