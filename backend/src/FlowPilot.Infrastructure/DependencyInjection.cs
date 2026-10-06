using FlowPilot.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace FlowPilot.Infrastructure;

public static class DependencyInjection
{
    public const string ReadyTag = "ready";

    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        // The connection string is resolved lazily (when the DbContext is first created), so the host can start
        // without a database or secrets, e.g. during build-time OpenAPI generation.
        services.AddDbContext<AppDbContext>((sp, options) =>
        {
            var connectionString = sp.GetRequiredService<IConfiguration>().GetConnectionString("Default");
            if (string.IsNullOrWhiteSpace(connectionString))
            {
                throw new InvalidOperationException(
                    "ConnectionStrings:Default is not configured. Set it via user-secrets or the ConnectionStrings__Default environment variable.");
            }

            options.UseNpgsql(connectionString);
        });

        services.AddHealthChecks().AddDbContextCheck<AppDbContext>(tags: [ReadyTag]);

        return services;
    }
}
