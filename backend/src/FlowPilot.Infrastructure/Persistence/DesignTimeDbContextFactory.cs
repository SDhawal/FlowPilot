using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace FlowPilot.Infrastructure.Persistence;

/// <summary>Used only by `dotnet ef`. Reads ConnectionStrings__Default, else falls back to the docker-compose dev database.</summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    private const string DevFallback =
        "Host=127.0.0.1;Port=5432;Database=flowpilot;Username=flowpilot;Password=flowpilot_dev_only";

    public AppDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__Default") ?? DevFallback;
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(connectionString)
            .Options;
        return new AppDbContext(options);
    }
}
