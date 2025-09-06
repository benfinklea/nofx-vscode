"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggingService = void 0;
const vscode = __importStar(require("vscode"));
class LoggingService {
    constructor(configService, mainChannel) {
        this.configService = configService;
        this.channels = new Map();
        this.timers = new Map();
        this.disposables = [];
        this.currentLogLevel = 'info';
        this.mainChannel = mainChannel;
        this.channels.set('main', this.mainChannel);
        this.updateLogLevel();
        const disposable = this.configService.onDidChange(() => {
            this.updateLogLevel();
        });
        this.disposables.push(disposable);
    }
    updateLogLevel() {
        const raw = this.configService.getLogLevel?.();
        if (!raw) {
            this.currentLogLevel = 'info';
            return;
        }
        const configLevel = String(raw).toLowerCase();
        if (['debug', 'info', 'warn', 'error'].includes(configLevel)) {
            this.currentLogLevel = configLevel;
        }
        else {
            this.currentLogLevel = 'info';
        }
    }
    _isLevelEnabled(level) {
        const levels = ['debug', 'info', 'warn', 'error'];
        const currentIndex = levels.indexOf(this.currentLogLevel);
        const targetIndex = levels.indexOf(level);
        return targetIndex >= currentIndex;
    }
    formatMessage(level, message, data) {
        const timestamp = new Date().toISOString();
        const levelStr = level.toUpperCase().padEnd(5);
        let formattedMessage = `[${timestamp}] ${levelStr} ${message}`;
        if (data !== undefined) {
            if (typeof data === 'object') {
                formattedMessage += `\n${JSON.stringify(data, null, 2)}`;
            }
            else {
                formattedMessage += ` ${data}`;
            }
        }
        return formattedMessage;
    }
    log(level, message, data) {
        if (!this._isLevelEnabled(level)) {
            return;
        }
        const formattedMessage = this.formatMessage(level, message, data);
        this.mainChannel.appendLine(formattedMessage);
        if (this.currentLogLevel === 'debug') {
            const consoleMethod = level === 'error' ? console.error :
                level === 'warn' ? console.warn :
                    level === 'info' ? console.info : console.log;
            consoleMethod(formattedMessage);
        }
    }
    debug(message, data) {
        this.log('debug', message, data);
    }
    info(message, data) {
        this.log('info', message, data);
    }
    warn(message, data) {
        this.log('warn', message, data);
    }
    error(message, data) {
        this.log('error', message, data);
    }
    isLevelEnabled(level) {
        return this._isLevelEnabled(level);
    }
    getChannel(name) {
        if (!this.channels.has(name)) {
            const channel = vscode.window.createOutputChannel(`NofX - ${name}`);
            this.channels.set(name, channel);
        }
        return this.channels.get(name);
    }
    time(label) {
        this.timers.set(label, Date.now());
    }
    timeEnd(label) {
        const startTime = this.timers.get(label);
        if (startTime !== undefined) {
            const duration = Date.now() - startTime;
            this.debug(`Timer ${label}: ${duration}ms`);
            this.timers.delete(label);
        }
    }
    onDidChangeConfiguration(callback) {
        return this.configService.onDidChange(callback);
    }
    dispose() {
        this.disposables.forEach(d => d.dispose());
        this.disposables.length = 0;
        this.channels.forEach((channel, name) => {
            if (name !== 'main') {
                channel.dispose();
            }
        });
        this.channels.clear();
        this.timers.clear();
    }
}
exports.LoggingService = LoggingService;
//# sourceMappingURL=LoggingService.js.map