export type ProjectVersionStatus = "current" | "missing" | "update_available" | "newer" | "unknown";
export interface InstallCommand {
    executable: "pnpm" | "npm" | "yarn" | "bun";
    args: string[];
    display: string;
}
export interface ProjectVersionCheck {
    status: ProjectVersionStatus;
    projectPath: string;
    bundledVersion: string;
    installedVersion: string | null;
    packagePath: string;
    install: InstallCommand | null;
}
export declare function checkProjectVersion(projectPathInput: string, packagePath: string): Promise<ProjectVersionCheck>;
//# sourceMappingURL=project-check.d.ts.map