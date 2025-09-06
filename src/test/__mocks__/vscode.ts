export const window = { 
  createOutputChannel: jest.fn(()=>({appendLine:jest.fn(),show:jest.fn(),hide:jest.fn(),dispose:jest.fn()})), 
  createTerminal: jest.fn(()=>({show:jest.fn(),sendText:jest.fn(),dispose:jest.fn()})), 
  createWebviewPanel: jest.fn(()=>({ 
    webview:{
      html:'', 
      onDidReceiveMessage: jest.fn(()=>({dispose:jest.fn()})), 
      postMessage: jest.fn() 
    }, 
    onDidDispose: jest.fn(()=>({dispose:jest.fn()})), 
    reveal: jest.fn(), 
    dispose: jest.fn() 
  })), 
  showSaveDialog: jest.fn(async()=>undefined), 
  registerTreeDataProvider: jest.fn(), 
  createTreeView: jest.fn(()=>({ 
    onDidChangeSelection: jest.fn(()=>({dispose:jest.fn()})), 
    reveal: jest.fn(), 
    dispose: jest.fn() 
  })), 
  createStatusBarItem: jest.fn(()=>({ 
    text:'', 
    tooltip:'', 
    command:'', 
    show:jest.fn(), 
    hide:jest.fn(), 
    dispose:jest.fn() 
  })),
  showInformationMessage: jest.fn().mockResolvedValue(undefined),
  showWarningMessage: jest.fn().mockResolvedValue(undefined),
  showErrorMessage: jest.fn().mockResolvedValue(undefined),
  showQuickPick: jest.fn().mockResolvedValue(undefined),
  showInputBox: jest.fn().mockResolvedValue(undefined),
  showOpenDialog: jest.fn().mockResolvedValue(undefined)
};

export const workspace = { 
  getConfiguration: jest.fn(()=>({ 
    get: jest.fn().mockReturnValue(undefined), 
    update: jest.fn().mockResolvedValue(undefined), 
    has: jest.fn().mockReturnValue(false), 
    inspect: jest.fn().mockReturnValue(undefined) 
  })), 
  workspaceFolders: [], 
  onDidChangeConfiguration: jest.fn(()=>({dispose:jest.fn()})) 
};

export const commands = { 
  executeCommand: jest.fn(),
  getCommands: jest.fn().mockResolvedValue([])
};

export const Uri = { file: (p:string)=>({ fsPath:p }) } as any;

export const ConfigurationTarget = { Global: 1, Workspace: 2 } as any;

export const StatusBarAlignment = { Left: 1, Right: 2 } as any;

export const WebviewPanel = function(){} as any;

export const ExtensionMode = {
  Production: 1,
  Development: 2,
  Test: 3
} as any;

export class EventEmitter {
  public event = jest.fn();
  public fire = jest.fn();
  public dispose = jest.fn();
}