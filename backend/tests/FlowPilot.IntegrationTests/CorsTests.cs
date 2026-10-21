using System.Net;

namespace FlowPilot.IntegrationTests;

[Trait("Category", "Integration")]
public sealed class CorsTests
{
    private const string UnreachableConnectionString =
        "Host=127.0.0.1;Port=1;Database=flowpilot;Username=x;Password=x;Timeout=2;Command Timeout=2";

    private static readonly Dictionary<string, string?> PagesOrigins = new()
    {
        ["Cors:AllowedOrigins:0"] = "https://flowpilot.pages.dev",
        ["Cors:AllowedOrigins:1"] = "https://*.flowpilot.pages.dev",
    };

    [Theory]
    [InlineData("https://flowpilot.pages.dev")]
    [InlineData("https://abc123.flowpilot.pages.dev")]
    [InlineData("https://feat-deploy.flowpilot.pages.dev")]
    public async Task Allowed_origin_is_echoed(string origin)
    {
        await using var factory = new ApiFactory(UnreachableConnectionString, PagesOrigins);
        using var client = factory.CreateClient();

        using var get = await SendAsync(client, HttpMethod.Get, origin);
        using var preflight = await SendAsync(client, HttpMethod.Options, origin);

        AllowedOrigin(get).ShouldBe(origin);
        AllowedOrigin(preflight).ShouldBe(origin);
    }

    [Theory]
    [InlineData("https://evil.example")]
    [InlineData("https://evil-flowpilot.pages.dev")]
    [InlineData("https://flowpilot.pages.dev.evil.example")]
    [InlineData("http://flowpilot.pages.dev")]
    [InlineData("http://abc123.flowpilot.pages.dev")]
    [InlineData("https://pages.dev")]
    public async Task Other_origins_get_no_allow_origin_header(string origin)
    {
        await using var factory = new ApiFactory(UnreachableConnectionString, PagesOrigins);
        using var client = factory.CreateClient();

        using var get = await SendAsync(client, HttpMethod.Get, origin);
        using var preflight = await SendAsync(client, HttpMethod.Options, origin);

        AllowedOrigin(get).ShouldBeNull();
        AllowedOrigin(preflight).ShouldBeNull();
    }

    [Fact]
    public async Task Allowed_preflight_for_an_authorized_request_succeeds()
    {
        await using var factory = new ApiFactory(UnreachableConnectionString, PagesOrigins);
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Options, "/health/live");
        request.Headers.Add("Origin", "https://abc123.flowpilot.pages.dev");
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "authorization,content-type");

        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        response.StatusCode.ShouldBe(HttpStatusCode.NoContent);
        AllowedOrigin(response).ShouldBe("https://abc123.flowpilot.pages.dev");
        response.Headers.Contains("Access-Control-Allow-Methods").ShouldBeTrue();
        string.Join(",", response.Headers.GetValues("Access-Control-Allow-Headers"))
            .ShouldContain("authorization", Case.Insensitive);
    }

    [Fact]
    public async Task Rejected_preflight_grants_no_cors_permissions()
    {
        await using var factory = new ApiFactory(UnreachableConnectionString, PagesOrigins);
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Options, "/health/live");
        request.Headers.Add("Origin", "https://evil.example");
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "authorization");

        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        AllowedOrigin(response).ShouldBeNull();
        response.Headers.Contains("Access-Control-Allow-Methods").ShouldBeFalse();
        response.Headers.Contains("Access-Control-Allow-Headers").ShouldBeFalse();
    }

    [Fact]
    public async Task No_configured_origins_allow_nothing()
    {
        await using var factory = new ApiFactory(UnreachableConnectionString);
        using var client = factory.CreateClient();

        using var get = await SendAsync(client, HttpMethod.Get, "https://flowpilot.pages.dev");

        AllowedOrigin(get).ShouldBeNull();
    }

    private static async Task<HttpResponseMessage> SendAsync(HttpClient client, HttpMethod method, string origin)
    {
        using var request = new HttpRequestMessage(method, "/health/live");
        request.Headers.Add("Origin", origin);
        if (method == HttpMethod.Options)
        {
            request.Headers.Add("Access-Control-Request-Method", "GET");
        }

        return await client.SendAsync(request, TestContext.Current.CancellationToken);
    }

    private static string? AllowedOrigin(HttpResponseMessage response) =>
        response.Headers.TryGetValues("Access-Control-Allow-Origin", out var values) ? values.Single() : null;
}
