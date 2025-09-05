import * as vscode from 'vscode';
import { ITreeViewHost, ILoggingService, ITreeDataProviderWithRefresh } from '../services/interfaces';

export class TreeViewHost implements ITreeViewHost {
    private treeView: vscode.TreeView<any>;
    private dataProvider?: ITreeDataProviderWithRefresh;
    private loggingService?: ILoggingService;
    private subscriptions: vscode.Disposable[] = [];

    constructor(treeView: vscode.TreeView<any>, dataProvider?: ITreeDataProviderWithRefresh, loggingService?: ILoggingService) {
        this.treeView = treeView;
        this.dataProvider = dataProvider;
        this.loggingService = loggingService;
        
        this.loggingService?.debug('TreeViewHost: Created for tree view', { 
            id: treeView.id,
            title: treeView.title 
        });
    }

    static create(treeView: vscode.TreeView<any>, dataProvider?: ITreeDataProviderWithRefresh, loggingService?: ILoggingService): TreeViewHost {
        return new TreeViewHost(treeView, dataProvider, loggingService);
    }

    refresh(): void {
        try {
            // Use the provided data provider's refresh method if available
            if (this.dataProvider && typeof this.dataProvider.refresh === 'function') {
                this.dataProvider.refresh();
                this.loggingService?.debug('TreeViewHost: Refreshed via data provider');
            } else {
                // No fallback method - data provider should implement refresh
                this.loggingService?.warn('TreeViewHost: No data provider with refresh method available');
            }
        } catch (error) {
            this.loggingService?.error('TreeViewHost: Error refreshing tree view', error);
            throw error;
        }
    }

    reveal(element: any): void {
        try {
            this.treeView.reveal(element);
            this.loggingService?.debug('TreeViewHost: Revealed element', { 
                elementId: element?.id || 'unknown' 
            });
        } catch (error) {
            this.loggingService?.error('TreeViewHost: Error revealing element', error);
            throw error;
        }
    }

    onDidChangeSelection(handler: (selection: any) => void): vscode.Disposable {
        const disposable = this.treeView.onDidChangeSelection(
            (e) => {
                try {
                    this.loggingService?.debug('TreeViewHost: Selection changed', { 
                        selectionCount: e.selection.length 
                    });
                    handler(e.selection);
                } catch (error) {
                    this.loggingService?.error('TreeViewHost: Error handling selection change', error);
                }
            }
        );
        
        this.subscriptions.push(disposable);
        return disposable;
    }

    getSelection(): any[] {
        try {
            return this.treeView.selection;
        } catch (error) {
            this.loggingService?.error('TreeViewHost: Error getting selection', error);
            return [];
        }
    }

    setSelection(items: any[]): void {
        try {
            // Note: VS Code TreeView doesn't have a direct setSelection method
            // This would need to be implemented through the data provider
            this.loggingService?.debug('TreeViewHost: Set selection requested', { 
                itemCount: items.length 
            });
            // Implementation would depend on the specific tree provider
        } catch (error) {
            this.loggingService?.error('TreeViewHost: Error setting selection', error);
            throw error;
        }
    }

    // Additional utility methods for tree view management
    get visible(): boolean {
        return this.treeView.visible;
    }

    get title(): string {
        return this.treeView.title;
    }

    set title(value: string) {
        this.treeView.title = value;
        this.loggingService?.debug('TreeViewHost: Set title', { title: value });
    }

    get message(): string {
        return this.treeView.message;
    }

    set message(value: string) {
        this.treeView.message = value;
        this.loggingService?.debug('TreeViewHost: Set message', { message: value });
    }

    get description(): string {
        return this.treeView.description;
    }

    set description(value: string) {
        this.treeView.description = value;
        this.loggingService?.debug('TreeViewHost: Set description', { description: value });
    }

    onDidChangeVisibility(listener: (e: vscode.TreeViewVisibilityChangeEvent) => any): vscode.Disposable {
        const disposable = this.treeView.onDidChangeVisibility(listener);
        this.subscriptions.push(disposable);
        return disposable;
    }

    onDidExpandElement(listener: (e: vscode.TreeViewExpansionEvent<any>) => any): vscode.Disposable {
        const disposable = this.treeView.onDidExpandElement(listener);
        this.subscriptions.push(disposable);
        return disposable;
    }

    onDidCollapseElement(listener: (e: vscode.TreeViewExpansionEvent<any>) => any): vscode.Disposable {
        const disposable = this.treeView.onDidCollapseElement(listener);
        this.subscriptions.push(disposable);
        return disposable;
    }

    dispose(): void {
        this.loggingService?.debug('TreeViewHost: Disposing');
        
        // Dispose all subscriptions
        this.subscriptions.forEach(sub => sub.dispose());
        this.subscriptions = [];
        
        // Note: TreeView disposal is typically handled by VS Code
        // We don't dispose the treeView itself here
    }
}
