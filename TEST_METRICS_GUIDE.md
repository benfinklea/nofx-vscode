# Test Metrics Guide: Beyond Code Coverage

## Traditional Coverage (Unit/Integration/E2E)
```
Code Coverage = Lines/Branches/Functions executed
✅ Measured by: Istanbul, nyc, Jest coverage
```

## The Four Priority Test Types Use Different Metrics

### 1. 🔥 **Smoke Tests**
**NOT measured by code coverage**

#### Primary Metrics:
- **Pass Rate**: % of critical paths working
- **Execution Time**: Must be < 2 minutes
- **MTTD (Mean Time To Detection)**: How fast we catch breaks

#### Example Dashboard:
```typescript
// smoke-metrics.json
{
  "passRate": "100%",         // All critical paths work
  "executionTime": "47s",      // Fast feedback
  "criticalPaths": 12,         // Number of smoke tests
  "lastFailure": "never",      // Reliability
  "confidenceScore": "98%"     // Can we deploy?
}
```

#### Measurement Tools:
- Test runner reports (Jest/Playwright)
- CI/CD dashboards
- Custom smoke monitors

---

### 2. 🏎️ **Performance Tests**
**NOT measured by code coverage**

#### Primary Metrics:
- **Response Time**: P50, P95, P99 percentiles
- **Throughput**: Operations/second
- **Resource Usage**: CPU, Memory, I/O
- **Degradation**: % change from baseline

#### Example Metrics:
```typescript
// performance-report.json
{
  "websocket": {
    "throughput": "1,247 msg/sec",     // Current
    "baseline": "1,200 msg/sec",       // Previous
    "change": "+3.9%",                  // Improvement!
    "p95_latency": "12ms",
    "p99_latency": "45ms"
  },
  "agentSpawn": {
    "avgTime": "234ms",
    "baseline": "250ms",
    "change": "-6.4%",                  // Faster!
    "memoryDelta": "+24MB"
  },
  "limits": {
    "maxConcurrentAgents": 47,
    "maxMessagesPerSec": 1247,
    "breakingPoint": "52 agents"        // System fails here
  }
}
```

#### Measurement Tools:
- k6, Artillery, JMeter
- Custom benchmarks
- APM tools (DataDog, New Relic)
- Lighthouse (for UI)

---

### 3. 🔒 **Security Tests**
**NOT measured by code coverage**

#### Primary Metrics:
- **Vulnerabilities**: Critical/High/Medium/Low count
- **CVSS Score**: Common Vulnerability Scoring (0-10)
- **Dependency Risk**: % of deps with known issues
- **Security Coverage**: % of attack vectors tested

#### Example Report:
```typescript
// security-scan.json
{
  "vulnerabilities": {
    "critical": 0,
    "high": 1,        // Action required!
    "medium": 3,
    "low": 7
  },
  "dependencies": {
    "total": 745,
    "vulnerable": 4,
    "percentage": "0.5%"
  },
  "owasp_top_10": {
    "injection": "✅ Protected",
    "broken_auth": "✅ Protected",
    "xss": "⚠️ Partial",
    "xxe": "✅ Protected",
    "access_control": "✅ Protected"
  },
  "cvss_score": 2.1,  // Low risk
  "compliance": {
    "soc2": "Pass",
    "gdpr": "Pass",
    "pci": "N/A"
  }
}
```

#### Measurement Tools:
- npm audit, Snyk, WhiteSource
- OWASP ZAP, Burp Suite
- SonarQube, CodeQL
- Penetration test reports

---

### 4. 📝 **Contract Tests**
**NOT measured by code coverage**

#### Primary Metrics:
- **Contract Coverage**: % of API endpoints with contracts
- **Schema Compliance**: % passing validation
- **Breaking Changes**: Count per release
- **Consumer Satisfaction**: % of contracts honored

#### Example Metrics:
```typescript
// contract-test-report.json
{
  "coverage": {
    "totalEndpoints": 23,
    "withContracts": 21,
    "percentage": "91%"
  },
  "compliance": {
    "passing": 21,
    "failing": 0,
    "percentage": "100%"
  },
  "consumers": {
    "conductor": "✅ All contracts satisfied",
    "agents": "✅ All contracts satisfied", 
    "dashboard": "✅ All contracts satisfied"
  },
  "schemaValidation": {
    "requests": "100% valid",
    "responses": "100% valid"
  },
  "versioning": {
    "breakingChanges": 0,
    "backwardCompatible": true
  }
}
```

#### Measurement Tools:
- Pact test reports
- OpenAPI validators
- GraphQL schema coverage
- Custom contract validators

---

## Unified Test Metrics Dashboard

### The Complete Picture:
```typescript
// test-metrics-dashboard.json
{
  "traditional_coverage": {
    "unit": "87% line coverage",
    "integration": "72% branch coverage",
    "e2e": "85% feature coverage"
  },
  
  "smoke_tests": {
    "metric": "Pass Rate",
    "value": "100%",
    "sla": ">98%",
    "status": "✅"
  },
  
  "performance": {
    "metric": "P95 Latency",
    "value": "12ms",
    "sla": "<50ms",
    "status": "✅"
  },
  
  "security": {
    "metric": "Critical Vulnerabilities",
    "value": "0",
    "sla": "0",
    "status": "✅"
  },
  
  "contracts": {
    "metric": "API Coverage",
    "value": "91%",
    "sla": ">80%",
    "status": "✅"
  },
  
  "overall_health": {
    "score": "94/100",
    "trend": "↑ +2 from last week",
    "deployment_confidence": "HIGH"
  }
}
```

---

## Key Differences from Code Coverage

### Code Coverage Tells You:
- ✅ Which lines were executed
- ✅ Which branches were taken
- ❌ NOT if the code is correct
- ❌ NOT if it's fast enough
- ❌ NOT if it's secure
- ❌ NOT if it meets contracts

### These Four Tests Tell You:
- ✅ **Smoke**: "Can we deploy safely?"
- ✅ **Performance**: "Is it fast enough?"
- ✅ **Security**: "Is it safe?"
- ✅ **Contract**: "Will it break consumers?"

---

## Implementation: Tracking All Metrics

### 1. Add Test Scripts
```json
// package.json
{
  "scripts": {
    "test:metrics": "npm run test:metrics:all",
    "test:metrics:coverage": "jest --coverage",
    "test:metrics:smoke": "jest smoke --json > metrics/smoke.json",
    "test:metrics:perf": "k6 run perf.js --out json=metrics/perf.json",
    "test:metrics:security": "npm audit --json > metrics/security.json",
    "test:metrics:contracts": "pact verify --json > metrics/contracts.json",
    "test:metrics:report": "node scripts/generate-metrics-report.js"
  }
}
```

### 2. Create Metrics Aggregator
```typescript
// scripts/generate-metrics-report.js
async function generateMetricsReport() {
  const metrics = {
    timestamp: new Date().toISOString(),
    coverage: await getCodeCoverage(),      // Traditional %
    smoke: await getSmokeMetrics(),         // Pass rate
    performance: await getPerfMetrics(),    // Latency/throughput
    security: await getSecurityMetrics(),   // Vulnerabilities
    contracts: await getContractMetrics(),  // API coverage
    overall: calculateHealthScore()         // Weighted score
  };
  
  await writeReport(metrics);
  await updateDashboard(metrics);
  await checkThresholds(metrics);         // Fail if below SLA
}
```

### 3. CI/CD Integration
```yaml
# .github/workflows/metrics.yml
- name: Collect All Metrics
  run: |
    npm run test:coverage         # Traditional coverage
    npm run test:smoke            # Pass rate
    npm run test:perf             # Performance baseline
    npm run test:security         # Vulnerability scan
    npm run test:contracts        # API compliance
    npm run test:metrics:report   # Generate unified report

- name: Upload Metrics
  uses: actions/upload-artifact@v3
  with:
    name: test-metrics
    path: metrics/

- name: Comment on PR
  uses: actions/github-script@v6
  with:
    script: |
      const metrics = require('./metrics/report.json');
      github.issues.createComment({
        body: `
        📊 Test Metrics:
        - Code Coverage: ${metrics.coverage}%
        - Smoke Pass Rate: ${metrics.smoke.passRate}%
        - P95 Latency: ${metrics.performance.p95}ms
        - Security Issues: ${metrics.security.critical}
        - Contract Coverage: ${metrics.contracts.coverage}%
        `
      });
```

---

## TL;DR - How to Measure

| Test Type | Primary Metric | Target | Tool |
|-----------|---------------|---------|------|
| **Unit/Integration/E2E** | Code Coverage % | >80% | Jest/Istanbul |
| **Smoke** | Pass Rate % | 100% | Test Runner |
| **Performance** | P95 Latency & Throughput | <50ms, >1000/s | k6/Artillery |
| **Security** | Critical Vulnerabilities | 0 | npm audit/Snyk |
| **Contract** | API Coverage % | >90% | Pact |

**Remember**: 100% code coverage ≠ bug-free or production-ready. You need multiple metrics for confidence!