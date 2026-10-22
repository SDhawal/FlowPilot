using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using static FlowPilot.Infrastructure.DependencyInjection;

namespace FlowPilot.Api.Endpoints;

public static class HealthEndpoints
{
    // Set by Render at runtime to the deployed commit SHA. Absent locally and in tests.
    private const string CommitSetting = "RENDER_GIT_COMMIT";

    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        // Liveness: process is up. Runs no checks.
        app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });

        // Readiness: dependencies (database) are reachable.
        app.MapHealthChecks("/health/ready", new HealthCheckOptions
        {
            Predicate = registration => registration.Tags.Contains(ReadyTag),
        });

        // Version: which commit is running. The deploy job polls this until it reports the merge SHA.
        app.MapGet("/health/version", (IConfiguration configuration, HttpContext context) =>
            {
                // Never let a cache answer "which version is live?" with an old value.
                context.Response.Headers.CacheControl = "no-store";
                var commit = configuration[CommitSetting];
                return TypedResults.Ok(new VersionResponse(string.IsNullOrWhiteSpace(commit) ? "dev" : commit));
            })
            .WithName("GetVersion")
            .WithTags("Health");

        return app;
    }
}

public sealed record VersionResponse(string Commit);
