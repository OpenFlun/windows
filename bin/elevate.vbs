Set sh = CreateObject("Shell.Application")
Set fso = CreateObject("Scripting.FileSystemObject")

tmp = fso.GetSpecialFolder(2) ' 获取系统临时目录
outFile = fso.BuildPath(tmp, "flun_el_output.txt")
batFile = fso.BuildPath(tmp, "flun_el.bat")
cmdFile = fso.BuildPath(tmp, "flun_el.cmd")

' 创建文件
Set batchFile = fso.CreateTextFile(batFile, True)
batchFile.WriteLine "@echo off"
batchFile.WriteLine "chcp 65001 > nul"

With fso.CreateTextFile(cmdFile, True)
    .WriteLine "@echo off"
    .WriteLine "{command}"  ' 实际命令
    .Close
End With

' 在批处理文件中调用命令文件并重定向所有输出
batchFile.WriteLine "call """ & cmdFile & """ > """ & outFile & """ 2>&1"
batchFile.Close

' 执行命令
sh.ShellExecute "cmd.exe", "/c """ & batFile & """", "", "runas", 0