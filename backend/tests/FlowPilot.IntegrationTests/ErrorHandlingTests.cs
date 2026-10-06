using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace FlowPilot.IntegrationTests;

[Trait("Category", "Integration")]
public sealed class ErrorHandlingTests
{
    private const string UnreachableConnectionString =
        "Host=127.0.0.1;Port=1;Database=flowpilot;Username=x;Password=x;Timeout=2;Command Timeout=2";

    private const string SecretMessage = "boom-secret-detail";

    [Fact]
    public async Task Unhandled_exception_returns_500_problem_details_without_details()
    {
        await using var factory = new ApiFactory(UnreachableConnectionString).WithWebHostBuilder(builder =>
            builder.ConfigureServices(services => services.AddSingleton<IStartupFilter, ThrowingEndpointFilter>()));
        using var client = factory.CreateClient();

        var response = await client.GetAsync(ThrowingEndpointFilter.Path, TestContext.Current.CancellationToken);

        response.StatusCode.ShouldBe(HttpStatusCode.InternalServerError);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        body.ShouldContain("\"status\":500");
        body.ShouldNotContain(SecretMessage);
        body.ShouldNotContain("stack", Case.Insensitive);
        body.ShouldNotContain("exception", Case.Insensitive);
    }

    // Appends a test-only branch after the app's own pipeline, so it runs inside UseExceptionHandler.
    private sealed class ThrowingEndpointFilter : IStartupFilter
    {
        public const string Path = "/__test/throw";

        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            next(app);
            app.Map(Path, branch => branch.Run(_ => throw new InvalidOperationException(SecretMessage)));
        };
    }
}
