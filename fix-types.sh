#!/bin/bash

echo "Fixing TypeScript errors..."

# Fix extension.ts type assertions
sed -i '' 's/container\.resolve(SERVICE_TOKENS\.CommandService)/container.resolve<ICommandService>(SERVICE_TOKENS.CommandService)/g' src/extension.ts
sed -i '' 's/container\.resolve(SERVICE_TOKENS\.TreeStateManager)/container.resolve<ITreeStateManager>(SERVICE_TOKENS.TreeStateManager)/g' src/extension.ts
sed -i '' 's/container\.resolve(SERVICE_TOKENS\.MetricsService)/container.resolve<IMetricsService>(SERVICE_TOKENS.MetricsService)/g' src/extension.ts
sed -i '' 's/container\.resolve(SERVICE_TOKENS\.ConfigurationService)/container.resolve<IConfigurationService>(SERVICE_TOKENS.ConfigurationService)/g' src/extension.ts
sed -i '' 's/container\.resolve(SERVICE_TOKENS\.NotificationService)/container.resolve<INotificationService>(SERVICE_TOKENS.NotificationService)/g' src/extension.ts
sed -i '' 's/container\.resolve(SERVICE_TOKENS\.LoggingService)/container.resolve<ILoggingService>(SERVICE_TOKENS.LoggingService)/g' src/extension.ts
sed -i '' 's/container\.resolve(SERVICE_TOKENS\.EventBus)/container.resolve<IEventBus>(SERVICE_TOKENS.EventBus)/g' src/extension.ts
sed -i '' 's/container\.resolve(SERVICE_TOKENS\.ErrorHandler)/container.resolve<IErrorHandler>(SERVICE_TOKENS.ErrorHandler)/g' src/extension.ts

# Fix parameter types
sed -i '' 's/\.filter(e =>/\.filter((e: ValidationError) =>/g' src/extension.ts
sed -i '' 's/validationResult\.errors\.filter(e =>/validationResult.errors.filter((e: ValidationError) =>/g' src/extension.ts

# Fix orchestrationServer undefined check
sed -i '' 's/orchestrationCommands\.setOrchestrationServer(orchestrationServer);/if (orchestrationServer) { orchestrationCommands.setOrchestrationServer(orchestrationServer); }/g' src/extension.ts

echo "Type fixes applied!"