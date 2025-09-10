#!/bin/bash

# 🚀 PHASE 13 IMPLEMENTATION: Update All Service References
# This agent ACTUALLY updates all container.resolve() calls throughout the codebase

echo "🚀 UPDATING all service references throughout codebase..."

# Find all TypeScript files that might contain container references
FILES_TO_UPDATE=$(find src -name "*.ts" -not -path "*/test/*" -not -name "Container.ts" | grep -v node_modules)

echo "🔍 Found $(echo "$FILES_TO_UPDATE" | wc -l) files to potentially update..."

# Create master replacement script
cat > /tmp/update_all_references.js << 'EOF'
const fs = require('fs');
const path = require('path');

const filesToUpdate = process.argv.slice(2);
let totalReplacements = 0;
let filesModified = 0;

console.log(`🔄 Processing ${filesToUpdate.length} files...`);

filesToUpdate.forEach(filePath => {
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️  File not found: ${filePath}`);
        return;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Track replacements for this file
    let fileReplacements = 0;
    
    // Replace container.resolve patterns
    content = content.replace(
        /container\.resolve<([^>]+)>\(SERVICE_TOKENS\.(\w+)\)/g,
        (match, typeName, serviceName) => {
            fileReplacements++;
            return `ServiceLocator.get<${typeName}>('${serviceName}')`;
        }
    );
    
    // Replace container.resolveOptional patterns
    content = content.replace(
        /container\.resolveOptional<([^>]+)>\(SERVICE_TOKENS\.(\w+)\)/g,
        (match, typeName, serviceName) => {
            fileReplacements++;
            return `ServiceLocator.tryGet<${typeName}>('${serviceName}')`;
        }
    );
    
    // Update imports if we made changes
    if (fileReplacements > 0) {
        // Add ServiceLocator import if not present
        if (!content.includes('ServiceLocator')) {
            // Find existing service imports and add ServiceLocator
            content = content.replace(
                /(import.*from.*['"]\.\/.+services.*['"];?)/,
                '$1\nimport { ServiceLocator } from \'../services/ServiceLocator\';'
            );
            
            // If no service imports found, add at top
            if (!content.includes('ServiceLocator')) {
                content = `import { ServiceLocator } from '../services/ServiceLocator';\n${content}`;
            }
        }
        
        // Remove Container imports
        content = content.replace(/import.*Container.*from.*['"]\.\.?\/.*services.*['"];?\n?/g, '');
        content = content.replace(/import.*SERVICE_TOKENS.*from.*['"]\.\.?\/.*services.*['"];?\n?/g, '');
        content = content.replace(/import.*IContainer.*from.*['"]\.\.?\/.*services.*['"];?\n?/g, '');
        
        fs.writeFileSync(filePath, content);
        totalReplacements += fileReplacements;
        filesModified++;
        
        console.log(`✅ ${path.basename(filePath)}: ${fileReplacements} replacements`);
    }
});

console.log(`\n📊 Migration Summary:`);
console.log(`   Files modified: ${filesModified}`);
console.log(`   Total replacements: ${totalReplacements}`);
EOF

# Execute the replacement script
echo "$FILES_TO_UPDATE" | tr ' ' '\n' | xargs node /tmp/update_all_references.js

# Specific file updates for known patterns
echo "🔄 Updating specific known files..."

# Update AgentManager.ts if it exists
if [ -f "src/agents/AgentManager.ts" ]; then
    echo "🔄 Updating AgentManager.ts..."
    sed -i.bak 's/container\.resolve/ServiceLocator.get/g' src/agents/AgentManager.ts
    sed -i.bak 's/SERVICE_TOKENS\./'"'"'/g' src/agents/AgentManager.ts
    sed -i.bak 's/'"'"')/'"'"')/g' src/agents/AgentManager.ts
fi

# Update command files
for cmd_file in src/commands/*.ts; do
    if [ -f "$cmd_file" ]; then
        echo "🔄 Updating $(basename "$cmd_file")..."
        sed -i.bak 's/container\.resolve/ServiceLocator.get/g' "$cmd_file"
    fi
done

# Clean up backup files
echo "🧹 Cleaning up backup files..."
find src -name "*.bak" -delete
rm -f /tmp/update_all_references.js

# Verify the migration
echo "✅ Verifying migration..."
REMAINING_CONTAINER_REFS=$(find src -name "*.ts" -not -name "Container.ts" -exec grep -l "container\.resolve\|SERVICE_TOKENS" {} \; 2>/dev/null | wc -l)

if [ "$REMAINING_CONTAINER_REFS" -eq 0 ]; then
    echo "✅ All container references successfully migrated!"
else
    echo "⚠️  $REMAINING_CONTAINER_REFS files still contain container references:"
    find src -name "*.ts" -not -name "Container.ts" -exec grep -l "container\.resolve\|SERVICE_TOKENS" {} \; 2>/dev/null
fi

echo "🚀 Service reference migration complete!"