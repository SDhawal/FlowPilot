# syntax=docker/dockerfile:1
# Build context: backend/  (docker build -f backend/Dockerfile backend)
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore layer (cached unless project files / package versions change)
COPY Directory.Build.props Directory.Packages.props ./
COPY src/FlowPilot.Domain/FlowPilot.Domain.csproj src/FlowPilot.Domain/
COPY src/FlowPilot.Application/FlowPilot.Application.csproj src/FlowPilot.Application/
COPY src/FlowPilot.Infrastructure/FlowPilot.Infrastructure.csproj src/FlowPilot.Infrastructure/
COPY src/FlowPilot.Api/FlowPilot.Api.csproj src/FlowPilot.Api/
RUN dotnet restore src/FlowPilot.Api/FlowPilot.Api.csproj

COPY src/ src/
# OpenAPI document is generated and committed from the dev build, not inside the image build.
RUN dotnet publish src/FlowPilot.Api/FlowPilot.Api.csproj -c Release -o /app/publish --no-restore \
    -p:UseAppHost=false -p:OpenApiGenerateDocuments=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_RUNNING_IN_CONTAINER=true
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "FlowPilot.Api.dll"]
