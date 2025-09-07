import * as vscode from 'vscode';
import { NotificationService } from '../../../services/NotificationService';

jest.mock('vscode');

describe('NotificationService', () => {
    let notificationService: NotificationService;
    let mockShowInformationMessage: jest.MockedFunction<typeof vscode.window.showInformationMessage>;
    let mockShowWarningMessage: jest.MockedFunction<typeof vscode.window.showWarningMessage>;
    let mockShowErrorMessage: jest.MockedFunction<typeof vscode.window.showErrorMessage>;
    let mockShowQuickPick: jest.MockedFunction<typeof vscode.window.showQuickPick>;
    let mockShowInputBox: jest.MockedFunction<typeof vscode.window.showInputBox>;
    let mockWithProgress: jest.MockedFunction<typeof vscode.window.withProgress>;

    beforeEach(() => {
        // Mock VS Code window methods
        mockShowInformationMessage = vscode.window.showInformationMessage as jest.MockedFunction<typeof vscode.window.showInformationMessage>;
        mockShowWarningMessage = vscode.window.showWarningMessage as jest.MockedFunction<typeof vscode.window.showWarningMessage>;
        mockShowErrorMessage = vscode.window.showErrorMessage as jest.MockedFunction<typeof vscode.window.showErrorMessage>;
        mockShowQuickPick = vscode.window.showQuickPick as jest.MockedFunction<typeof vscode.window.showQuickPick>;
        mockShowInputBox = vscode.window.showInputBox as jest.MockedFunction<typeof vscode.window.showInputBox>;
        mockWithProgress = vscode.window.withProgress as jest.MockedFunction<typeof vscode.window.withProgress>;

        notificationService = new NotificationService();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('showInformation', () => {
        it('should call vscode.window.showInformationMessage with correct parameters', async () => {
            const message = 'Test information message';
            const items = ['OK', 'Cancel'];
            mockShowInformationMessage.mockResolvedValue('OK');

            const result = await notificationService.showInformation(message, ...items);

            expect(mockShowInformationMessage).toHaveBeenCalledWith(message, ...items);
            expect(result).toBe('OK');
        });

        it('should handle message without items', async () => {
            const message = 'Simple message';
            mockShowInformationMessage.mockResolvedValue(undefined);

            const result = await notificationService.showInformation(message);

            expect(mockShowInformationMessage).toHaveBeenCalledWith(message);
            expect(result).toBeUndefined();
        });

        it('should handle empty message', async () => {
            const message = '';
            mockShowInformationMessage.mockResolvedValue(undefined);

            await notificationService.showInformation(message);

            expect(mockShowInformationMessage).toHaveBeenCalledWith(message);
        });

        it('should handle multiple items', async () => {
            const message = 'Choose option';
            const items = ['Option 1', 'Option 2', 'Option 3'];
            mockShowInformationMessage.mockResolvedValue('Option 2');

            const result = await notificationService.showInformation(message, ...items);

            expect(mockShowInformationMessage).toHaveBeenCalledWith(message, ...items);
            expect(result).toBe('Option 2');
        });

        it('should handle rejection gracefully', async () => {
            const message = 'Test message';
            mockShowInformationMessage.mockRejectedValue(new Error('Failed to show message'));

            await expect(notificationService.showInformation(message)).rejects.toThrow('Failed to show message');
        });
    });

    describe('showWarning', () => {
        it('should call vscode.window.showWarningMessage with correct parameters', async () => {
            const message = 'Test warning message';
            const items = ['Continue', 'Cancel'];
            mockShowWarningMessage.mockResolvedValue('Continue');

            const result = await notificationService.showWarning(message, ...items);

            expect(mockShowWarningMessage).toHaveBeenCalledWith(message, ...items);
            expect(result).toBe('Continue');
        });

        it('should handle message without items', async () => {
            const message = 'Warning without options';
            mockShowWarningMessage.mockResolvedValue(undefined);

            const result = await notificationService.showWarning(message);

            expect(mockShowWarningMessage).toHaveBeenCalledWith(message);
            expect(result).toBeUndefined();
        });

        it('should handle long warning messages', async () => {
            const message = 'This is a very long warning message that contains a lot of information about potential issues that need attention';
            mockShowWarningMessage.mockResolvedValue(undefined);

            await notificationService.showWarning(message);

            expect(mockShowWarningMessage).toHaveBeenCalledWith(message);
        });
    });

    describe('showError', () => {
        it('should call vscode.window.showErrorMessage with correct parameters', async () => {
            const message = 'Test error message';
            const items = ['Retry', 'Cancel'];
            mockShowErrorMessage.mockResolvedValue('Retry');

            const result = await notificationService.showError(message, ...items);

            expect(mockShowErrorMessage).toHaveBeenCalledWith(message, ...items);
            expect(result).toBe('Retry');
        });

        it('should handle error message without items', async () => {
            const message = 'Critical error occurred';
            mockShowErrorMessage.mockResolvedValue(undefined);

            const result = await notificationService.showError(message);

            expect(mockShowErrorMessage).toHaveBeenCalledWith(message);
            expect(result).toBeUndefined();
        });

        it('should handle special characters in error messages', async () => {
            const message = 'Error: File "test.js" not found at path /home/user/projects';
            mockShowErrorMessage.mockResolvedValue(undefined);

            await notificationService.showError(message);

            expect(mockShowErrorMessage).toHaveBeenCalledWith(message);
        });
    });

    describe('showQuickPick', () => {
        it('should call vscode.window.showQuickPick with items and options', async () => {
            const items = [
                { label: 'Option 1', description: 'First option' },
                { label: 'Option 2', description: 'Second option' }
            ];
            const options = { placeHolder: 'Select an option' };
            mockShowQuickPick.mockResolvedValue(items[0]);

            const result = await notificationService.showQuickPick(items, options);

            expect(mockShowQuickPick).toHaveBeenCalledWith(items, options);
            expect(result).toBe(items[0]);
        });

        it('should handle empty items array', async () => {
            const items: vscode.QuickPickItem[] = [];
            const options = { placeHolder: 'No options available' };
            mockShowQuickPick.mockResolvedValue(undefined);

            const result = await notificationService.showQuickPick(items, options);

            expect(mockShowQuickPick).toHaveBeenCalledWith(items, options);
            expect(result).toBeUndefined();
        });

        it('should handle multi-select quick pick', async () => {
            const items = [
                { label: 'Item 1' },
                { label: 'Item 2' },
                { label: 'Item 3' }
            ];
            const options = { canPickMany: true as const, placeHolder: 'Select multiple items' };
            const selectedItems = [items[0], items[2]];
            mockShowQuickPick.mockResolvedValue(selectedItems);

            const result = await notificationService.showQuickPick(items, options);

            expect(mockShowQuickPick).toHaveBeenCalledWith(items, options);
            expect(result).toEqual(selectedItems);
        });

        it('should handle quick pick without options', async () => {
            const items = [{ label: 'Single option' }];
            mockShowQuickPick.mockResolvedValue(items[0]);

            const result = await notificationService.showQuickPick(items);

            expect(mockShowQuickPick).toHaveBeenCalledWith(items, undefined);
            expect(result).toBe(items[0]);
        });

        it('should handle user cancellation', async () => {
            const items = [{ label: 'Option' }];
            mockShowQuickPick.mockResolvedValue(undefined);

            const result = await notificationService.showQuickPick(items);

            expect(result).toBeUndefined();
        });
    });

    describe('showInputBox', () => {
        it('should call vscode.window.showInputBox with options', async () => {
            const options = { 
                prompt: 'Enter your name',
                placeholder: 'John Doe',
                value: 'Default name'
            };
            const userInput = 'Test User';
            mockShowInputBox.mockResolvedValue(userInput);

            const result = await notificationService.showInputBox(options);

            expect(mockShowInputBox).toHaveBeenCalledWith(options);
            expect(result).toBe(userInput);
        });

        it('should handle input box without options', async () => {
            const userInput = 'User input';
            mockShowInputBox.mockResolvedValue(userInput);

            const result = await notificationService.showInputBox();

            expect(mockShowInputBox).toHaveBeenCalledWith(undefined);
            expect(result).toBe(userInput);
        });

        it('should handle user cancellation of input box', async () => {
            const options = { prompt: 'Enter text' };
            mockShowInputBox.mockResolvedValue(undefined);

            const result = await notificationService.showInputBox(options);

            expect(mockShowInputBox).toHaveBeenCalledWith(options);
            expect(result).toBeUndefined();
        });

        it('should handle validation in input box', async () => {
            const options = {
                prompt: 'Enter email',
                validateInput: (value: string) => {
                    return value.includes('@') ? null : 'Please enter a valid email';
                }
            };
            mockShowInputBox.mockResolvedValue('test@example.com');

            const result = await notificationService.showInputBox(options);

            expect(mockShowInputBox).toHaveBeenCalledWith(options);
            expect(result).toBe('test@example.com');
        });
    });

    describe('withProgress', () => {
        it('should call vscode.window.withProgress with options and task', async () => {
            const options = {
                location: vscode.ProgressLocation.Notification,
                title: 'Processing...',
                cancellable: true
            };
            const taskResult = 'Task completed';
            const mockTask = jest.fn().mockResolvedValue(taskResult);
            mockWithProgress.mockImplementation((opts, task) => task({} as any));

            const result = await notificationService.withProgress(options, mockTask);

            expect(mockWithProgress).toHaveBeenCalledWith(options, mockTask);
            expect(result).toBe(taskResult);
        });

        it('should handle progress updates in task', async () => {
            const options = {
                location: vscode.ProgressLocation.Notification,
                title: 'Long running task'
            };
            const mockProgress = {
                report: jest.fn()
            };
            const mockTask = jest.fn().mockImplementation((progress) => {
                progress.report({ message: 'Step 1', increment: 25 });
                progress.report({ message: 'Step 2', increment: 50 });
                return Promise.resolve('Done');
            });
            mockWithProgress.mockImplementation((opts, task) => task(mockProgress as any));

            const result = await notificationService.withProgress(options, mockTask);

            expect(mockTask).toHaveBeenCalledWith(mockProgress);
            expect(result).toBe('Done');
        });

        it('should handle task errors in withProgress', async () => {
            const options = {
                location: vscode.ProgressLocation.Window,
                title: 'Failing task'
            };
            const error = new Error('Task failed');
            const mockTask = jest.fn().mockRejectedValue(error);
            mockWithProgress.mockImplementation((opts, task) => task({} as any));

            await expect(notificationService.withProgress(options, mockTask)).rejects.toThrow('Task failed');
        });
    });

    describe('confirm', () => {
        it('should show confirmation dialog and return true when user confirms', async () => {
            const message = 'Are you sure you want to proceed?';
            const confirmText = 'Yes';
            const mockResult = { title: confirmText, isCloseAffordance: false };
            mockShowInformationMessage.mockResolvedValue(mockResult);

            const result = await notificationService.confirm(message, confirmText);

            expect(mockShowInformationMessage).toHaveBeenCalledWith(
                message,
                { title: confirmText, isCloseAffordance: false },
                { title: 'Cancel', isCloseAffordance: true }
            );
            expect(result).toBe(true);
        });

        it('should return false when user cancels', async () => {
            const message = 'Confirm action';
            const mockResult = { title: 'Cancel', isCloseAffordance: true };
            mockShowInformationMessage.mockResolvedValue(mockResult);

            const result = await notificationService.confirm(message);

            expect(result).toBe(false);
        });

        it('should use default confirm text when not provided', async () => {
            const message = 'Proceed?';
            const mockResult = { title: 'Yes', isCloseAffordance: false };
            mockShowInformationMessage.mockResolvedValue(mockResult);

            const result = await notificationService.confirm(message);

            expect(mockShowInformationMessage).toHaveBeenCalledWith(
                message,
                { title: 'Yes', isCloseAffordance: false },
                { title: 'Cancel', isCloseAffordance: true }
            );
            expect(result).toBe(true);
        });

        it('should return false when user dismisses dialog', async () => {
            const message = 'Confirm?';
            mockShowInformationMessage.mockResolvedValue(undefined);

            const result = await notificationService.confirm(message);

            expect(result).toBe(false);
        });

        it('should handle custom confirm text', async () => {
            const message = 'Delete file?';
            const confirmText = 'Delete';
            const mockResult = { title: confirmText, isCloseAffordance: false };
            mockShowInformationMessage.mockResolvedValue(mockResult);

            const result = await notificationService.confirm(message, confirmText);

            expect(mockShowInformationMessage).toHaveBeenCalledWith(
                message,
                { title: confirmText, isCloseAffordance: false },
                { title: 'Cancel', isCloseAffordance: true }
            );
            expect(result).toBe(true);
        });
    });

    describe('confirmDestructive', () => {
        it('should show warning dialog for destructive action and return true when confirmed', async () => {
            const message = 'This will permanently delete all data. Continue?';
            const confirmText = 'Delete';
            const mockResult = { title: confirmText, isCloseAffordance: false };
            mockShowWarningMessage.mockResolvedValue(mockResult);

            const result = await notificationService.confirmDestructive(message, confirmText);

            expect(mockShowWarningMessage).toHaveBeenCalledWith(
                message,
                { title: confirmText, isCloseAffordance: false },
                { title: 'Cancel', isCloseAffordance: true }
            );
            expect(result).toBe(true);
        });

        it('should return false when user cancels destructive action', async () => {
            const message = 'Delete everything?';
            const mockResult = { title: 'Cancel', isCloseAffordance: true };
            mockShowWarningMessage.mockResolvedValue(mockResult);

            const result = await notificationService.confirmDestructive(message);

            expect(result).toBe(false);
        });

        it('should use default destructive confirm text', async () => {
            const message = 'Remove all agents?';
            const mockResult = { title: 'Delete', isCloseAffordance: false };
            mockShowWarningMessage.mockResolvedValue(mockResult);

            const result = await notificationService.confirmDestructive(message);

            expect(mockShowWarningMessage).toHaveBeenCalledWith(
                message,
                { title: 'Delete', isCloseAffordance: false },
                { title: 'Cancel', isCloseAffordance: true }
            );
            expect(result).toBe(true);
        });

        it('should return false when destructive dialog is dismissed', async () => {
            const message = 'Destructive action?';
            mockShowWarningMessage.mockResolvedValue(undefined);

            const result = await notificationService.confirmDestructive(message);

            expect(result).toBe(false);
        });
    });

    describe('edge cases and error handling', () => {
        it('should handle very long messages', async () => {
            const longMessage = 'a'.repeat(1000);
            mockShowInformationMessage.mockResolvedValue(undefined);

            await notificationService.showInformation(longMessage);

            expect(mockShowInformationMessage).toHaveBeenCalledWith(longMessage);
        });

        it('should handle messages with special characters', async () => {
            const message = 'Message with special chars: \n\r\t"\'<>&';
            mockShowInformationMessage.mockResolvedValue(undefined);

            await notificationService.showInformation(message);

            expect(mockShowInformationMessage).toHaveBeenCalledWith(message);
        });

        it('should handle Unicode messages', async () => {
            const message = 'Unicode test: 🎵 ñáéíóú 中文 العربية';
            mockShowInformationMessage.mockResolvedValue(undefined);

            await notificationService.showInformation(message);

            expect(mockShowInformationMessage).toHaveBeenCalledWith(message);
        });

        it('should handle null/undefined in items array', async () => {
            const message = 'Test with null items';
            const items = ['Valid', null as any, undefined as any, 'Another Valid'];
            mockShowInformationMessage.mockResolvedValue('Valid');

            await notificationService.showInformation(message, ...items);

            expect(mockShowInformationMessage).toHaveBeenCalledWith(message, ...items);
        });

        it('should handle async errors in method calls', async () => {
            const message = 'Test error handling';
            const error = new Error('VS Code API error');
            mockShowInformationMessage.mockRejectedValue(error);

            await expect(notificationService.showInformation(message)).rejects.toThrow('VS Code API error');
        });
    });
});