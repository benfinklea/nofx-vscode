# Documentation Cleanup Plan

## 📁 Proposed Directory Structure

```
/
├── README.md                    # Keep - main project readme
├── CLAUDE.md                    # Keep - Claude instructions  
├── SYSTEM_ARCHITECTURE.md       # Keep - mandatory system map
├── CONTRIBUTING.md              # Keep - contribution guidelines
├── docs/
│   ├── development/
│   │   ├── DEVELOPER_GUIDE.md
│   │   ├── BUILD_GUIDE.md
│   │   ├── DEBUGGING.md
│   │   ├── INSTALL.md
│   │   └── TROUBLESHOOTING.md
│   ├── testing/
│   │   ├── TESTING_GUIDE.md
│   │   ├── E2E_TESTING.md
│   │   ├── PERFORMANCE_TEST_ROADMAP.md
│   │   └── reports/
│   │       ├── BULLETPROOF_TEST_SUMMARY.md
│   │       ├── COVERAGE_ANALYSIS_REPORT.md
│   │       ├── E2E_COVERAGE_REPORT.md
│   │       ├── PERFORMANCE_TEST_REPORT.md
│   │       └── ROBUSTNESS_TEST_REPORT.md
│   ├── architecture/
│   │   ├── MULTI_AGENT_ANALYSIS.md
│   │   ├── SUB_AGENT_ARCHITECTURE.md
│   │   ├── WEBSOCKET_ANALYSIS.md
│   │   ├── WORKTREE_ANALYSIS.md
│   │   └── THE_PHILOSOPHY_OF_NOFX.md
│   ├── audits/
│   │   ├── COMMAND_AUDIT.md
│   │   ├── CONDUCTOR_AUDIT.md
│   │   ├── CONFIG_AUDIT.md
│   │   ├── DEAD_CODE_AUDIT.md
│   │   ├── EVENT_SYSTEM_AUDIT.md
│   │   ├── METRICS_AUDIT.md
│   │   ├── MONITORING_AUDIT.md
│   │   ├── PERSISTENCE_AUDIT.md
│   │   ├── SERVICE_AUDIT.md
│   │   ├── TASK_SYSTEM_AUDIT.md
│   │   └── TEST_AUDIT.md
│   ├── implementation/
│   │   ├── status/
│   │   │   ├── PHASE_16_IMPLEMENTATION_STATUS.md
│   │   │   ├── PHASES_13-20_ENHANCED.md
│   │   │   ├── PHASES_13-20_IMPLEMENTATION.md
│   │   │   ├── PHASES_17-20_COMPLETE.md
│   │   │   ├── REFACTORING_COMPLETE.md
│   │   │   └── REFACTORING_PHASE1_COMPLETE.md
│   │   ├── guides/
│   │   │   ├── ENTERPRISE_IMPLEMENTATION_GUIDE.md
│   │   │   ├── SIMPLE_TASK_SYSTEM_MIGRATION.md
│   │   │   └── SINGLE_EVENT_SYSTEM_IMPLEMENTATION.md
│   │   └── enterprise/
│   │       ├── ENTERPRISE_EVENTBUS_IMPLEMENTATION.md
│   │       ├── ENTERPRISE_RELIABILITY_IMPLEMENTATION.md
│   │       ├── ENTERPRISE_RELIABILITY_STATUS.md
│   │       └── ENTERPRISE_TASK_SYSTEM_DOCUMENTATION.md
│   ├── templates/
│   │   ├── AGENT_TEMPLATES.md
│   │   ├── CUSTOM_TEMPLATE_LOCATIONS.md
│   │   ├── TEMPLATE_ANALYSIS.md
│   │   └── TEMPLATE_CONSOLIDATION.md
│   └── archive/
│       ├── old-phases/
│       │   ├── PHASES_13-20_SPECIALIZED_AGENTS.md
│       │   └── PHASES_21-30_ENTREPRENEUR_VISION.md
│       ├── completed-features/
│       │   ├── WEBSOCKET_REMOVAL_COMPLETE.md
│       │   ├── E2E_TESTS_FIXED.md
│       │   └── VALIDATION_REPORT.md
│       └── outdated/
│           ├── CLAUDE_SETUP.md
│           ├── VP_CONDUCTOR.md
│           ├── CONDUCTOR_TRUTH.md
│           └── robust-balanced.md
```

## 🗑️ Files to DELETE (outdated/temporary)

```bash
# Test files that are now obsolete
rm conductor-test-script.md
rm soft-dependency-test.md
rm test-ai-providers.md
rm test-extension.md
rm test-progress-report.md
rm QUICK_TEST.md
rm DEBUG_TASKS.md
rm FIXES.md

# Temporary analysis files
rm DEPENDENCY_PRIORITIZATION.md
rm ENHANCED_LOGGING.md
rm MISSING_TEST_TYPES.md
rm ROBUSTNESS_FEATURES.md
rm SECURITY_TEST_OVERVIEW.md
rm TEST_METRICS_GUIDE.md
rm TESTING_CLAUDE.md
rm TESTING_GAPS_ANALYSIS.md
rm TESTING_PERSISTENCE.md
rm TESTING_STRATEGY_IMPLEMENTATION.md
rm TEST_ORCHESTRATION.md

# These seem like old status files
rm E2E_TEST_STATUS.md
rm ENTREPRENEUR_TESTING_STRATEGY.md
```

## 📋 Action Items

1. **Create docs/ subdirectories**
2. **Move files to appropriate subdirectories**
3. **Delete obsolete files**
4. **Update any references in remaining files**
5. **Create a docs/README.md with navigation**

## 🎯 Result
- Root directory: 4 essential files
- All documentation organized by category
- Easy to find relevant docs
- Clear separation of active vs archived content