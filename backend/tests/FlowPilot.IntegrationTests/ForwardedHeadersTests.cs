using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace FlowPilot.IntegrationTests;

[Trait("Category", "Integration")]
public sealed class ForwardedHeadersTests
{
    private const string UnreachableConnectionString =
        "Host=127.0.0.1;Port=1;Database=flowpilot;Username=x;Password=x;Timeout=2;Command Timeout=2";

    [Fact]
    public async Task Forwarded_proto_sets_the_request_scheme()
    {
        var echo = await SendAsync("Testing", ("X-Forwarded-Proto", "https"));

        echo.GetProperty("scheme").GetString().ShouldBe("https");
    }

    [Fact]
    public async Task Forwarded_for_sets_the_remote_ip()
    {
        var echo = await SendAsync("Testing", ("X-Forwarded-For", "203.0.113.7"));

        echo.GetProperty("remoteIp").GetString().ShouldBe("203.0.113.7");
    }

    [Fact]
    public async Task Only_the_right_most_forwarded_for_entry_is_used()
    {
        // The client sent a fake "198.51.100.1"; the proxy appended the real IP on the right.
        var echo = await SendAsync("Testing", ("X-Forwarded-For", "198.51.100.1, 203.0.113.7"));

        echo.GetProperty("remoteIp").GetString().ShouldBe("203.0.113.7");
    }

    [Fact]
    public async Task Forwarded_headers_are_ignored_in_development()
    {
        var echo = await SendAsync(
            "Development",
            ("X-Forwarded-Proto", "https"),
            ("X-Forwarded-For", "203.0.113.7"));

        echo.GetProperty("scheme").GetString().ShouldBe("http");
        echo.GetProperty("remoteIp").GetString().ShouldNotBe("203.0.113.7");
    }

    private static async Task<JsonElement> SendAsync(string environment, params (string Name, string Value)[] headers)
    {
        await using var factory = new ApiFactory(UnreachableConnectionString, environment: environment)
            .WithWebHostBuilder(builder =>
                builder.ConfigureServices(services => services.AddSingleton<IStartupFilter, EchoEndpointFilter>()));
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, EchoEndpointFilter.Path);
        foreach (var (name, value) in headers)
        {
            request.Headers.TryAddWithoutValidation(name, value);
        }

        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
    }

    // Appends a test-only branch after the app's own pipeline, so it runs after UseForwardedHeaders.
    private sealed class EchoEndpointFilter : IStartupFilter
    {
        public const string Path = "/__test/echo";

        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            next(app);
            app.Map(Path, branch => branch.Run(context => context.Response.WriteAsJsonAsync(new
            {
                scheme = context.Request.Scheme,
                remoteIp = context.Connection.RemoteIpAddress?.ToString(),
            })));
        };
    }
}
