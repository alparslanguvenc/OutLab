; Inno Setup script for the OutLab Windows installer.
; Built by .github/workflows/desktop.yml after PyInstaller has produced build-desktop\dist\OutLab.
; Installs per user (no administrator rights needed) under %LOCALAPPDATA%\Programs\OutLab.

#ifndef AppVersion
  #define AppVersion "1.4.1"
#endif

[Setup]
AppId={{6F0A7C1E-3B5D-4E2A-9C61-0B7D2F4A8E13}
AppName=OutLab
AppVersion={#AppVersion}
AppVerName=OutLab {#AppVersion}
AppPublisher=Alparslan Güvenç
AppPublisherURL=https://github.com/alparslanguvenc/OutLab
AppSupportURL=https://github.com/alparslanguvenc/OutLab/issues
DefaultDirName={localappdata}\Programs\OutLab
DefaultGroupName=OutLab
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\..\release
OutputBaseFilename=OutLab-Windows-Setup
SetupIconFile=..\icons\outlab.ico
UninstallDisplayIcon={app}\OutLab.exe
LicenseFile=..\..\LICENSE
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\..\build-desktop\dist\OutLab\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\OutLab"; Filename: "{app}\OutLab.exe"
Name: "{group}\{cm:UninstallProgram,OutLab}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\OutLab"; Filename: "{app}\OutLab.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\OutLab.exe"; Description: "{cm:LaunchProgram,OutLab}"; Flags: nowait postinstall skipifsilent
