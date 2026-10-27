
Set objFSO = CreateObject("Scripting.FileSystemObject")
Set objShell = CreateObject("WScript.Shell")

strScriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
strProjectDir = objFSO.GetParentFolderName(strScriptDir)

objShell.CurrentDirectory = strProjectDir

strCommand = "cmd.exe /c node dist/index.js >> data\companion.log 2>&1"

objShell.Run strCommand, 0, False
