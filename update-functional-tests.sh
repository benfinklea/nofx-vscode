#!/bin/bash

# Update all functional test files to use the new setup

echo "Updating functional test files to use extension activation setup..."

# List of test files to update (excluding CommandSmokeTests and AgentLifecycle which are already done)
TEST_FILES=(
  "src/test/functional/TaskManagement.test.ts"
  "src/test/functional/ConductorWorkflows.test.ts"
  "src/test/functional/UIComponents.test.ts"
  "src/test/functional/OrchestrationIntegration.test.ts"
  "src/test/functional/ErrorHandling.test.ts"
  "src/test/functional/MetricsAndPersistence.test.ts"
)

for file in "${TEST_FILES[@]}"; do
  echo "Processing $file..."
  
  # Check if file exists
  if [ ! -f "$file" ]; then
    echo "  File not found, skipping..."
    continue
  fi
  
  # Check if setup import already exists
  if grep -q "from './setup'" "$file"; then
    echo "  Already has setup import, skipping..."
    continue
  fi
  
  # Add import for setup functions at the top of the file (after other imports)
  # Find the last import line and add the setup import after it
  awk '/^import/ { imports = imports $0 "\n" } 
       !/^import/ && !done { 
         if (imports) {
           print imports "import { setupExtension, teardownExtension, setupMockWorkspace, clearMockWorkspace } from '\''./setup'\'';"
           imports = ""
           done = 1
         }
         print 
       }
       /^import/ { next }' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  
  echo "  Added setup import"
done

echo "Done updating functional test files!"
echo "Note: You may need to manually update the beforeAll/afterAll hooks in each test file"
echo "to call setupExtension() and teardownExtension()"