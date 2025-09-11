import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ILogger } from './interfaces';

export interface GitRepository {
    rootPath: string;
    currentBranch?: string;
    remoteUrl?: string;
    lastCommitHash?: string;
    isGitRepo: boolean;
}

export class GitService {
    constructor(private loggingService: ILogger) {}

    async getRepositoryInfo(workspacePath: string): Promise<GitRepository> {
        try {
            const gitDir = path.join(workspacePath, '.git');
            const isGitRepo = fs.existsSync(gitDir);
            
            if (!isGitRepo) {
                this.loggingService.debug('No git repository found at:', workspacePath);
                return {
                    rootPath: workspacePath,
                    isGitRepo: false
                };
            }

            const currentBranch = await this.getCurrentBranch(workspacePath);
            const remoteUrl = await this.getRemoteUrl(workspacePath);
            const lastCommitHash = await this.getLastCommitHash(workspacePath);

            return {
                rootPath: workspacePath,
                currentBranch,
                remoteUrl,
                lastCommitHash,
                isGitRepo: true
            };
        } catch (error) {
            this.loggingService.error('Error getting git repository info:', error);
            return {
                rootPath: workspacePath,
                isGitRepo: false
            };
        }
    }

    private async getCurrentBranch(repoPath: string): Promise<string | undefined> {
        try {
            const headPath = path.join(repoPath, '.git', 'HEAD');
            if (!fs.existsSync(headPath)) {
                return undefined;
            }

            const headContent = fs.readFileSync(headPath, 'utf8').trim();
            
            // Check if HEAD points to a branch (ref: refs/heads/branch-name)
            if (headContent.startsWith('ref: refs/heads/')) {
                return headContent.replace('ref: refs/heads/', '');
            }
            
            // If HEAD contains a commit hash directly (detached HEAD)
            if (headContent.length === 40 && /^[a-f0-9]+$/i.test(headContent)) {
                return 'detached-head';
            }
            
            return undefined;
        } catch (error) {
            this.loggingService.debug('Could not read current branch:', error);
            return undefined;
        }
    }

    private async getRemoteUrl(repoPath: string): Promise<string | undefined> {
        try {
            const configPath = path.join(repoPath, '.git', 'config');
            if (!fs.existsSync(configPath)) {
                return undefined;
            }

            const configContent = fs.readFileSync(configPath, 'utf8');
            
            // Look for [remote "origin"] section and extract URL
            const remoteOriginMatch = configContent.match(/\[remote "origin"\]([\s\S]*?)(?=\[|$)/);
            if (remoteOriginMatch) {
                const remoteSection = remoteOriginMatch[1];
                const urlMatch = remoteSection.match(/url\s*=\s*(.+)/);
                if (urlMatch) {
                    return urlMatch[1].trim();
                }
            }
            
            return undefined;
        } catch (error) {
            this.loggingService.debug('Could not read remote URL:', error);
            return undefined;
        }
    }

    private async getLastCommitHash(repoPath: string): Promise<string | undefined> {
        try {
            const headPath = path.join(repoPath, '.git', 'HEAD');
            if (!fs.existsSync(headPath)) {
                return undefined;
            }

            const headContent = fs.readFileSync(headPath, 'utf8').trim();
            
            if (headContent.startsWith('ref: ')) {
                // HEAD points to a branch, read the ref file
                const refPath = path.join(repoPath, '.git', headContent.replace('ref: ', ''));
                if (fs.existsSync(refPath)) {
                    const commitHash = fs.readFileSync(refPath, 'utf8').trim();
                    return commitHash.substring(0, 8); // Short hash
                }
            } else if (headContent.length === 40 && /^[a-f0-9]+$/i.test(headContent)) {
                // HEAD contains commit hash directly
                return headContent.substring(0, 8); // Short hash
            }
            
            return undefined;
        } catch (error) {
            this.loggingService.debug('Could not read last commit hash:', error);
            return undefined;
        }
    }

    async isWorkingDirectoryClean(workspacePath: string): Promise<boolean> {
        try {
            // Check if there are uncommitted changes
            const gitIndexPath = path.join(workspacePath, '.git', 'index');
            const gitHeadPath = path.join(workspacePath, '.git', 'HEAD');
            
            if (!fs.existsSync(gitIndexPath) || !fs.existsSync(gitHeadPath)) {
                return true; // No git repo or no commits yet
            }

            // Simple check - in a real implementation you might want to use git commands
            // For now, we'll assume it's clean unless we can detect obvious changes
            return true;
        } catch (error) {
            this.loggingService.debug('Could not check working directory status:', error);
            return true; // Assume clean on error
        }
    }

    /**
     * Generate a unique identifier for the git repository
     * This combines the remote URL (if available) with the root path
     */
    generateRepositoryId(repoInfo: GitRepository): string {
        if (repoInfo.remoteUrl) {
            // Use remote URL as primary identifier (most reliable)
            return this.hashString(repoInfo.remoteUrl);
        } else {
            // Fallback to root path
            return this.hashString(repoInfo.rootPath);
        }
    }

    private hashString(input: string): string {
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16).substring(0, 12);
    }

    /**
     * Check if VS Code has git extension API available
     */
    async getVSCodeGitAPI(): Promise<any> {
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (gitExtension && gitExtension.isActive) {
                return gitExtension.exports.getAPI(1);
            }
        } catch (error) {
            this.loggingService.debug('VS Code Git API not available:', error);
        }
        return null;
    }

    /**
     * Enhanced repository info using VS Code Git API if available
     */
    async getEnhancedRepositoryInfo(workspacePath: string): Promise<GitRepository> {
        try {
            const gitAPI = await this.getVSCodeGitAPI();
            
            if (gitAPI) {
                // Use VS Code Git API for more accurate information
                const repository = gitAPI.repositories.find((repo: any) => 
                    repo.rootUri.fsPath === workspacePath
                );
                
                if (repository) {
                    return {
                        rootPath: workspacePath,
                        currentBranch: repository.state.HEAD?.name,
                        remoteUrl: repository.state.remotes[0]?.fetchUrl,
                        lastCommitHash: repository.state.HEAD?.commit?.substring(0, 8),
                        isGitRepo: true
                    };
                }
            }
        } catch (error) {
            this.loggingService.debug('Could not use VS Code Git API, falling back to file system:', error);
        }
        
        // Fallback to file system based detection
        return this.getRepositoryInfo(workspacePath);
    }
}