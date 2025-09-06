// Mock TypeScript module to prevent errors in test environment
export const ScriptTarget = {
    ES2020: 99,
    Latest: 99
};

export const ScriptKind = {
    TS: 3,
    TSX: 4,
    JS: 1,
    JSX: 2
};

export const SyntaxKind = {
    SourceFile: 290,
    ClassDeclaration: 245,
    InterfaceDeclaration: 246,
    FunctionDeclaration: 244,
    MethodDeclaration: 161,
    PropertyDeclaration: 159,
    Constructor: 162,
    Identifier: 75,
    StringLiteral: 10,
    NumericLiteral: 8,
    ImportDeclaration: 254,
    ExportDeclaration: 260,
    VariableStatement: 225,
    Block: 223,
    ExpressionStatement: 226,
    ReturnStatement: 235,
    IfStatement: 227,
    ForStatement: 230,
    WhileStatement: 231,
    DoStatement: 232,
    SwitchStatement: 237,
    CaseClause: 277,
    DefaultClause: 278,
    TryStatement: 240,
    CatchClause: 280,
    ThrowStatement: 239,
    CallExpression: 196,
    NewExpression: 197,
    PropertyAccessExpression: 194,
    ElementAccessExpression: 195,
    BinaryExpression: 209,
    ConditionalExpression: 210,
    ArrowFunction: 202,
    FunctionExpression: 201,
    TypeAliasDeclaration: 247,
    EnumDeclaration: 248,
    ModuleDeclaration: 249,
    NamespaceKeyword: 136,
    PublicKeyword: 117,
    PrivateKeyword: 118,
    ProtectedKeyword: 119,
    StaticKeyword: 120,
    ReadonlyKeyword: 138,
    AsyncKeyword: 126,
    AwaitExpression: 207,
    TypeReference: 169,
    ArrayType: 174,
    UnionType: 178,
    IntersectionType: 179,
    LiteralType: 183,
    ObjectLiteralExpression: 193,
    ArrayLiteralExpression: 192,
    SpreadElement: 213,
    JsxElement: 266,
    JsxSelfClosingElement: 267,
    JsxOpeningElement: 268,
    JsxClosingElement: 269,
    JsxAttribute: 273,
    JsxText: 11,
    JsxExpression: 276,
    TemplateExpression: 211,
    TaggedTemplateExpression: 198,
    Parameter: 156,
    Decorator: 157,
    PropertySignature: 158,
    MethodSignature: 160,
    GetAccessor: 163,
    SetAccessor: 164,
    TypeParameter: 155,
    HeritageClause: 279,
    ExpressionWithTypeArguments: 216,
    ImplementsKeyword: 113,
    ExtendsKeyword: 90,
    ExportKeyword: 89,
    DefaultKeyword: 88,
    DeclareKeyword: 130
};

export const ModifierFlags = {
    None: 0,
    Export: 1,
    Public: 4,
    Private: 8,
    Protected: 16,
    Static: 32,
    Readonly: 64,
    Abstract: 128,
    Async: 256,
    Default: 512,
    Const: 2048,
    HasComputedFlags: 536870912
};

export const NodeFlags = {
    None: 0,
    Let: 1,
    Const: 2,
    NestedNamespace: 4,
    Synthesized: 8,
    Namespace: 16,
    GlobalAugmentation: 32,
    ContainsThis: 64,
    HasImplicitReturn: 128,
    HasExplicitReturn: 256,
    GlobalAugmentation2: 512,
    HasAsyncFunctions: 1024,
    DisallowInContext: 2048,
    YieldContext: 4096,
    DecoratorContext: 8192,
    AwaitContext: 16384,
    ThisNodeHasError: 32768,
    JavaScriptFile: 65536,
    ThisNodeOrAnySubNodesHasError: 131072,
    HasAggregatedChildData: 262144
};

export const TypeFlags = {
    Any: 1,
    Unknown: 2,
    String: 4,
    Number: 8,
    Boolean: 16,
    Enum: 32,
    BigInt: 64,
    StringLiteral: 128,
    NumberLiteral: 256,
    BooleanLiteral: 512,
    EnumLiteral: 1024,
    BigIntLiteral: 2048,
    ESSymbol: 4096,
    UniqueESSymbol: 8192,
    Void: 16384,
    Undefined: 32768,
    Null: 65536,
    Never: 131072,
    TypeParameter: 262144,
    Object: 524288,
    Union: 1048576,
    Intersection: 2097152,
    Index: 4194304,
    IndexedAccess: 8388608,
    Conditional: 16777216,
    Substitution: 33554432,
    NonPrimitive: 67108864,
    AnyOrUnknown: 3,
    Nullable: 98304,
    Literal: 2944,
    Unit: 109440,
    StringOrNumberLiteral: 384,
    PossiblyFalsy: 117724,
    StringLike: 132,
    NumberLike: 296,
    BigIntLike: 2112,
    BooleanLike: 528,
    EnumLike: 1056,
    ESSymbolLike: 12288,
    VoidLike: 49152,
    UnionOrIntersection: 3145728,
    StructuredType: 3670016,
    TypeVariable: 8650752,
    InstantiableNonPrimitive: 58982400,
    InstantiablePrimitive: 4194304,
    Instantiable: 63176704,
    StructuredOrInstantiable: 66846720
};

export const SymbolFlags = {
    None: 0,
    FunctionScopedVariable: 1,
    BlockScopedVariable: 2,
    Property: 4,
    EnumMember: 8,
    Function: 16,
    Class: 32,
    Interface: 64,
    ConstEnum: 128,
    RegularEnum: 256,
    ValueModule: 512,
    NamespaceModule: 1024,
    TypeLiteral: 2048,
    ObjectLiteral: 4096,
    Method: 8192,
    Constructor: 16384,
    GetAccessor: 32768,
    SetAccessor: 65536,
    Signature: 131072,
    TypeParameter: 262144,
    TypeAlias: 524288,
    ExportValue: 1048576,
    Alias: 2097152,
    Prototype: 4194304,
    ExportStar: 8388608,
    Optional: 16777216,
    Transient: 33554432
};

// Mock functions
export function createSourceFile(
    fileName: string,
    sourceText: string,
    languageVersion: any,
    setParentNodes?: boolean,
    scriptKind?: any
): any {
    return {
        fileName,
        text: sourceText,
        languageVersion,
        scriptKind,
        kind: SyntaxKind.SourceFile,
        statements: [],
        endOfFileToken: { kind: 1 },
        flags: 0,
        languageVariant: 0,
        lineMap: [],
        getLineAndCharacterOfPosition: () => ({ line: 0, character: 0 }),
        getStart: () => 0,
        getEnd: () => sourceText.length,
        getText: () => sourceText,
        getFullText: () => sourceText,
        getSourceFile: () => null,
        getChildCount: () => 0,
        getChildAt: () => null,
        getChildren: () => [],
        forEachChild: () => {}
    };
}

export function createProgram(
    rootNames: string[],
    options: any,
    host?: any,
    oldProgram?: any,
    configFileParsingDiagnostics?: any[]
): any {
    return {
        getRootFileNames: () => rootNames,
        getSourceFiles: () => [],
        getSourceFile: (fileName: string) => createSourceFile(fileName, '', ScriptTarget.ES2020),
        getOptionsDiagnostics: () => [],
        getGlobalDiagnostics: () => [],
        getSyntacticDiagnostics: () => [],
        getSemanticDiagnostics: () => [],
        getDeclarationDiagnostics: () => [],
        getTypeChecker: () => createTypeChecker(),
        emit: () => ({ emitSkipped: false, diagnostics: [] }),
        getCompilerOptions: () => options,
        getCurrentDirectory: () => process.cwd(),
        getNodeCount: () => 0,
        getIdentifierCount: () => 0,
        getSymbolCount: () => 0,
        getTypeCount: () => 0
    };
}

export function createTypeChecker(): any {
    return {
        getSymbolAtLocation: () => null,
        getTypeAtLocation: () => null,
        getTypeOfSymbolAtLocation: () => null,
        getDeclaredTypeOfSymbol: () => null,
        getPropertiesOfType: () => [],
        getPropertyOfType: () => null,
        getSignaturesOfType: () => [],
        getIndexTypeOfType: () => null,
        getBaseTypes: () => [],
        getBaseTypeOfLiteralType: () => null,
        getWidenedType: () => null,
        getReturnTypeOfSignature: () => null,
        getNullableType: () => null,
        getNonNullableType: () => null,
        typeToString: () => 'any',
        symbolToString: () => '',
        getFullyQualifiedName: () => '',
        getAugmentedPropertiesOfType: () => [],
        getRootSymbols: () => [],
        getContextualType: () => null,
        getResolvedSignature: () => null,
        getSignatureFromDeclaration: () => null,
        isImplementationOfOverload: () => false,
        isUndefinedSymbol: () => false,
        isArgumentsSymbol: () => false,
        isUnknownSymbol: () => false,
        getConstantValue: () => undefined
    };
}

export function createCompilerHost(options: any): any {
    return {
        getSourceFile: createSourceFile,
        getDefaultLibFileName: () => 'lib.d.ts',
        writeFile: () => {},
        getCurrentDirectory: () => process.cwd(),
        getCanonicalFileName: (fileName: string) => fileName,
        useCaseSensitiveFileNames: () => false,
        getNewLine: () => '\n',
        fileExists: () => true,
        readFile: () => '',
        directoryExists: () => true,
        getDirectories: () => []
    };
}

export function forEachChild(node: any, callback: any): void {
    // Mock implementation
}

export function isSourceFile(node: any): boolean {
    return node && node.kind === SyntaxKind.SourceFile;
}

export function isClassDeclaration(node: any): boolean {
    return node && node.kind === SyntaxKind.ClassDeclaration;
}

export function isFunctionDeclaration(node: any): boolean {
    return node && node.kind === SyntaxKind.FunctionDeclaration;
}

export function isMethodDeclaration(node: any): boolean {
    return node && node.kind === SyntaxKind.MethodDeclaration;
}

export function isPropertyDeclaration(node: any): boolean {
    return node && node.kind === SyntaxKind.PropertyDeclaration;
}

export function isInterfaceDeclaration(node: any): boolean {
    return node && node.kind === SyntaxKind.InterfaceDeclaration;
}

export function isTypeAliasDeclaration(node: any): boolean {
    return node && node.kind === SyntaxKind.TypeAliasDeclaration;
}

export function isEnumDeclaration(node: any): boolean {
    return node && node.kind === SyntaxKind.EnumDeclaration;
}

export function isModuleDeclaration(node: any): boolean {
    return node && node.kind === SyntaxKind.ModuleDeclaration;
}

export function isImportDeclaration(node: any): boolean {
    return node && node.kind === SyntaxKind.ImportDeclaration;
}

export function isExportDeclaration(node: any): boolean {
    return node && node.kind === SyntaxKind.ExportDeclaration;
}

export function isVariableStatement(node: any): boolean {
    return node && node.kind === SyntaxKind.VariableStatement;
}

export function isIdentifier(node: any): boolean {
    return node && node.kind === SyntaxKind.Identifier;
}

export function isStringLiteral(node: any): boolean {
    return node && node.kind === SyntaxKind.StringLiteral;
}

export function isCallExpression(node: any): boolean {
    return node && node.kind === SyntaxKind.CallExpression;
}

export function isPropertyAccessExpression(node: any): boolean {
    return node && node.kind === SyntaxKind.PropertyAccessExpression;
}

export function getCombinedModifierFlags(node: any): number {
    return node?.modifierFlags || 0;
}

export function getJSDocTags(node: any): any[] {
    return [];
}

export function getLeadingCommentRanges(text: string, pos: number): any[] {
    return [];
}

export function getTrailingCommentRanges(text: string, pos: number): any[] {
    return [];
}

export function createScanner(
    languageVersion: any,
    skipTrivia: boolean,
    languageVariant?: any,
    text?: string,
    onError?: any,
    start?: number,
    length?: number
): any {
    return {
        getStartPos: () => 0,
        getToken: () => 0,
        getTextPos: () => 0,
        getTokenPos: () => 0,
        getTokenText: () => '',
        getTokenValue: () => '',
        hasExtendedUnicodeEscape: () => false,
        hasPrecedingLineBreak: () => false,
        isIdentifier: () => false,
        isReservedWord: () => false,
        isUnterminated: () => false,
        reScanGreaterToken: () => 0,
        reScanSlashToken: () => 0,
        reScanTemplateToken: () => 0,
        scanJsxIdentifier: () => 0,
        scanJsxAttributeValue: () => 0,
        reScanJsxToken: () => 0,
        reScanLessThanToken: () => 0,
        scanJsxToken: () => 0,
        scanJSDocToken: () => 0,
        scan: () => 0,
        getText: () => text || '',
        setText: () => {},
        setScriptTarget: () => {},
        setLanguageVariant: () => {},
        setOnError: () => {},
        setTextPos: () => {},
        tryScan: () => 0,
        lookAhead: () => 0,
        scanRange: () => 0
    };
}

export function findConfigFile(
    searchPath: string,
    fileExists: (fileName: string) => boolean,
    configName?: string
): string | undefined {
    return undefined;
}

export function readConfigFile(
    fileName: string,
    readFile: (path: string) => string | undefined
): { config?: any; error?: any } {
    return { config: {} };
}

export function parseJsonConfigFileContent(
    json: any,
    host: any,
    basePath: string,
    existingOptions?: any,
    configFileName?: string,
    resolutionStack?: any[],
    extraFileExtensions?: any[]
): any {
    return {
        options: {},
        fileNames: [],
        errors: []
    };
}

export const sys = {
    args: [],
    newLine: '\n',
    useCaseSensitiveFileNames: false,
    write: () => {},
    writeOutputIsTTY: () => false,
    readFile: () => undefined,
    writeFile: () => {},
    resolvePath: (path: string) => path,
    fileExists: () => false,
    directoryExists: () => false,
    createDirectory: () => {},
    getExecutingFilePath: () => '',
    getCurrentDirectory: () => process.cwd(),
    getDirectories: () => [],
    readDirectory: () => [],
    exit: () => {},
    getModifiedTime: () => undefined,
    setModifiedTime: () => {},
    deleteFile: () => {},
    createHash: () => '',
    createSHA256Hash: () => '',
    getMemoryUsage: () => 0,
    getFileSize: () => 0,
    watchFile: () => ({ close: () => {} }),
    watchDirectory: () => ({ close: () => {} }),
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    clearScreen: () => {},
    base64decode: () => '',
    base64encode: () => '',
    enableCPUProfiler: () => {},
    disableCPUProfiler: () => {},
    realpath: (path: string) => path,
    getEnvironmentVariable: () => ''
};

// Export default
export default {
    ScriptTarget,
    ScriptKind,
    SyntaxKind,
    ModifierFlags,
    NodeFlags,
    TypeFlags,
    SymbolFlags,
    createSourceFile,
    createProgram,
    createTypeChecker,
    createCompilerHost,
    forEachChild,
    isSourceFile,
    isClassDeclaration,
    isFunctionDeclaration,
    isMethodDeclaration,
    isPropertyDeclaration,
    isInterfaceDeclaration,
    isTypeAliasDeclaration,
    isEnumDeclaration,
    isModuleDeclaration,
    isImportDeclaration,
    isExportDeclaration,
    isVariableStatement,
    isIdentifier,
    isStringLiteral,
    isCallExpression,
    isPropertyAccessExpression,
    getCombinedModifierFlags,
    getJSDocTags,
    getLeadingCommentRanges,
    getTrailingCommentRanges,
    createScanner,
    findConfigFile,
    readConfigFile,
    parseJsonConfigFileContent,
    sys
};
