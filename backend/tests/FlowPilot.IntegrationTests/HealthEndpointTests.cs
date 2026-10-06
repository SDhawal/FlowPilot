using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace FlowPilot.IntegrationTests;

[Trait("Category", "Integration")]
public sealed class HealthEndpointTests(PostgresFixture postgres) : IClassFixture<PostgresFixture>
{
    private const string UnreachableConnectionString =
        "Host=127.0.0.1;Port=1;Database=flowpilot;Username=x;Password=x;Timeout=2;Command Timeout=2";

    [Fact]
    public async Task Live_returns_200_without_a_database()
    {
        await using var factory = new ApiFactory(UnreachableConnectionString);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health/live", TestContext.Current.CancellationToken);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Ready_returns_200_when_database_is_reachable()
    {
        await using var factory = new ApiFactory(postgres.ConnectionString);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health/ready", TestContext.Current.CancellationToken);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Ready_returns_503_when_database_is_unreachable()
    {
        await using var factory = new ApiFactory(UnreachableConnectionString);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health/ready", TestContext.Current.CancellationToken);

        response.StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable);
    }

    [Fact]
    public async Task Unknown_route_returns_404_problem_details()
    {
        await using var factory = new ApiFactory(postgres.ConnectionString);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/does-not-exist", TestContext.Current.CancellationToken);

        response.StatusCode.ShouldBe(HttpStatusCode.NotFound);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        body.GetProperty("status").GetInt32().ShouldBe(404);
    }
}
