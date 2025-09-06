#!/bin/bash

echo "Fixing command ID mismatches in test files..."

# Fix command IDs in all test files
TEST_FILES=$(find src/test -name "*.test.ts" -type f)

for file in $TEST_FILES; do
    echo "Processing $file..."
    
    # Fix removeAgent -> deleteAgent
    sed -i '' 's/nofx\.removeAgent/nofx.deleteAgent/g' "$file"
    
    # Fix openOrchestrator -> showOrchestrator  
    sed -i '' 's/nofx\.openOrchestrator/nofx.showOrchestrator/g' "$file"
    
    # Fix createCustomTemplate -> createAgentTemplate
    sed -i '' 's/nofx\.createCustomTemplate/nofx.createAgentTemplate/g' "$file"
    
    # Remove references to non-existent commands
    sed -i '' '/nofx\.helloWorld/d' "$file"
    sed -i '' '/nofx\.viewAgentDetails/d' "$file"
    sed -i '' '/nofx\.focusAgentTerminal/d' "$file"
    sed -i '' '/nofx\.assignTask/d' "$file"
    sed -i '' '/nofx\.cancelTask/d' "$file"
    sed -i '' '/nofx\.viewTaskDetails/d' "$file"
    sed -i '' '/nofx\.cleanupWorktrees/d' "$file"
done

echo "Command ID fixes complete!"