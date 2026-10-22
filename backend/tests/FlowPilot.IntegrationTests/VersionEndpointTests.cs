using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace FlowPilot.IntegrationTests;

[Trait("Category", "Integration")]
public sealed class VersionEndpointTests
{
    // The version endpoint must never touch the database, so every test runs without one.
    private const string UnreachableConnectionString =
        "Host=127.0.0.1;Port=1;Database=flowpilot;Username=x;Password=x;Timeout=2;Command Timeout=2";

    [Fact]
    public async Task Returns_the_configured_commit()
    {
        const string sha = "3f9c2a1d0b8e4f6a7c5d3e2f1a0b9c8d7e6f5a4b";
        await using var factory = new ApiFactory(
            UnreachableConnectionString,
            new Dictionary<string, string?> { ["RENDER_GIT_COMMIT"] = sha });
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health/version", TestContext.Current.CancellationToken);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/json");
        response.Headers.CacheControl?.NoStore.ShouldBe(true);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        body.GetProperty("commit").GetString().ShouldBe(sha);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Returns_dev_when_no_commit_is_configured(string? commit)
    {
        await using var factory = new ApiFactory(
            UnreachableConnectionString,
            new Dictionary<string, string?> { ["RENDER_GIT_COMMIT"] = commit });
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health/version", TestContext.Current.CancellationToken);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        body.GetProperty("commit").GetString().ShouldBe("dev");
    }
}
