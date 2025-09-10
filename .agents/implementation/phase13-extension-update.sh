#!/bin/bash

# 🚀 PHASE 13 IMPLEMENTATION: Extension.ts Container → ServiceLocator Migration
# This agent ACTUALLY updates extension.ts to use ServiceLocator

echo "🚀 UPDATING extension.ts to use ServiceLocator..."

EXTENSION_FILE="src/extension.ts"

if [ ! -f "$EXTENSION_FILE" ]; then
    echo "❌ extension.ts not found!"
    exit 1
fi

# Create backup
cp "$EXTENSION_FILE" "${EXTENSION_FILE}.backup"
echo "💾 Created backup: ${EXTENSION_FILE}.backup"

# Step 1: Update imports
echo "🔄 Updating imports..."
sed -i.tmp 's/import { Container }/import { ServiceLocator }/g' "$EXTENSION_FILE"
sed -i.tmp '/SERVICE_TOKENS,/d' "$EXTENSION_FILE"
sed -i.tmp '/IContainer,/d' "$EXTENSION_FILE"

# Step 2: Replace container variable with ServiceLocator
echo "🔄 Replacing container references..."
sed -i.tmp 's/let container: IContainer;/\/\/ ServiceLocator replaces Container/g' "$EXTENSION_FILE"
sed -i.tmp 's/container = new Container(/ServiceLocator.initialize(/g' "$EXTENSION_FILE"

# Step 3: Find and replace all container.register() calls
echo "🔄 Converting service registrations..."

# Create a temporary script to handle complex replacements
cat > /tmp/update_registrations.js << 'EOF'
const fs = require('fs');
const content = fs.readFileSync('src/extension.ts', 'utf8');

let updated = content;

// Replace container.register patterns
updated = updated.replace(
    /container\.register\(\s*SERVICE_TOKENS\.(\w+),\s*\(.*?\) => new (\w+)\(.*?\),?\s*'singleton'\s*\);?/gs,
    (match, serviceName, className) => {
        return `const ${serviceName.toLowerCase()} = new ${className}();\n        ServiceLocator.register('${serviceName}', ${serviceName.toLowerCase()});`;
    }
);

// Replace container.registerInstance patterns  
updated = updated.replace(
    /container\.registerInstance\(\s*SERVICE_TOKENS\.(\w+),\s*(\w+)\s*\);?/g,
    (match, serviceName, instanceName) => {
        return `ServiceLocator.register('${serviceName}', ${instanceName});`;
    }
);

// Replace container.resolve patterns
updated = updated.replace(
    /container\.resolve<(\w+)>\(SERVICE_TOKENS\.(\w+)\)/g,
    (match, typeName, serviceName) => {
        return `ServiceLocator.get<${typeName}>('${serviceName}')`;
    }
);

// Replace container.resolveOptional patterns
updated = updated.replace(
    /container\.resolveOptional<(\w+)>\(SERVICE_TOKENS\.(\w+)\)/g,
    (match, typeName, serviceName) => {
        return `ServiceLocator.tryGet<${typeName}>('${serviceName}')`;
    }
);

fs.writeFileSync('src/extension.ts', updated);
console.log('✅ Service registrations updated');
EOF

# Run the replacement script
node /tmp/update_registrations.js

# Step 4: Update activation function to use ServiceLocator.initialize
echo "🔄 Updating activation function..."
sed -i.tmp 's/export async function activate(context: vscode.ExtensionContext)/export async function activate(context: vscode.ExtensionContext)/g' "$EXTENSION_FILE"

# Add ServiceLocator initialization at the start of activate function
sed -i.tmp '/export async function activate(context: vscode.ExtensionContext) {/a\
    \/\/ 🚀 Initialize ServiceLocator\
    ServiceLocator.initialize(context);' "$EXTENSION_FILE"

# Step 5: Clean up and verify
echo "🧹 Cleaning up temporary files..."
rm -f "${EXTENSION_FILE}.tmp"
rm -f /tmp/update_registrations.js

# Verify the changes
echo "✅ Verifying changes..."
if grep -q "ServiceLocator" "$EXTENSION_FILE"; then
    echo "✅ ServiceLocator import found"
else
    echo "❌ ServiceLocator import missing!"
    exit 1
fi

if grep -q "ServiceLocator.initialize" "$EXTENSION_FILE"; then
    echo "✅ ServiceLocator initialization found"
else  
    echo "❌ ServiceLocator initialization missing!"
    exit 1
fi

# Count replacements
REGISTER_COUNT=$(grep -c "ServiceLocator.register" "$EXTENSION_FILE" || echo "0")
GET_COUNT=$(grep -c "ServiceLocator.get" "$EXTENSION_FILE" || echo "0")

echo "📊 Migration summary:"
echo "   - ServiceLocator.register() calls: $REGISTER_COUNT"
echo "   - ServiceLocator.get() calls: $GET_COUNT"
echo "   - Backup saved to: ${EXTENSION_FILE}.backup"

echo "🚀 Extension.ts migration complete!"