#!/bin/bash

# 🎸 NofX Agent Orchestration Script
# Usage: ./execute-phase.sh <phase_number> [agent_type]

PHASE=$1
AGENT_TYPE=$2
AGENTS_DIR=".agents"
PHASE_FILE="$AGENTS_DIR/shared/contracts/phase-contracts.json"

echo "🎸 Starting NofX Phase $PHASE execution..."

if [ ! -f "$PHASE_FILE" ]; then
    echo "❌ Phase contracts file not found: $PHASE_FILE"
    exit 1
fi

# Function to execute agent task
execute_agent_task() {
    local agent=$1
    local phase=$2
    local task=$3
    
    echo "🤖 Executing $agent agent task: $task"
    
    case $agent in
        "performance")
            echo "🔥 PERFORMANCE OPTIMIZER: $task"
            ./.agents/performance/execute.sh "$phase" "$task"
            ;;
        "security") 
            echo "🛡️ SECURITY AUDITOR: $task"
            ./.agents/security/execute.sh "$phase" "$task"
            ;;
        "testing")
            echo "🧪 TEST GENERATOR: $task"
            ./.agents/testing/execute.sh "$phase" "$task"
            ;;
        "documentation")
            echo "📚 DOCUMENTATION WRITER: $task"
            ./.agents/documentation/execute.sh "$phase" "$task"
            ;;
        *)
            echo "❌ Unknown agent type: $agent"
            return 1
            ;;
    esac
}

# Function to execute all agents for a phase
execute_phase() {
    local phase=$1
    
    echo "🚀 Executing Phase $phase with all agents..."
    
    # Execute in optimal order
    echo "Step 1: Performance analysis..."
    execute_agent_task "performance" "$phase" "all"
    
    echo "Step 2: Security audit..."
    execute_agent_task "security" "$phase" "all"
    
    echo "Step 3: Test generation..."
    execute_agent_task "testing" "$phase" "all"
    
    echo "Step 4: Documentation..."
    execute_agent_task "documentation" "$phase" "all"
    
    echo "✅ Phase $phase complete!"
}

# Execute based on parameters
if [ -z "$AGENT_TYPE" ]; then
    # Execute all agents for the phase
    execute_phase "$PHASE"
else
    # Execute specific agent
    execute_agent_task "$AGENT_TYPE" "$PHASE" "all"
fi

echo "🎸 Phase $PHASE execution complete!"