using FlowPilot.Api.Endpoints;
using FlowPilot.Application;
using FlowPilot.Infrastructure;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);

if (!builder.Environment.IsDevelopment())
{
    builder.Logging.ClearProviders();
    builder.Logging.AddJsonConsole();
}

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();

// Render terminates TLS at its proxy and forwards plain HTTP. Its proxy IPs aren't published,
// so we trust whoever is directly connected: safe only because the container is reachable
// through that proxy alone. ForwardLimit stays 1: only the right-most X-Forwarded-For entry
// (appended by the proxy) is used, so a client-supplied entry to its left is ignored.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options =>
    options.AddPolicy("web", policy =>
    {
        if (allowedOrigins.Length > 0)
        {
            policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod();
        }
    }));

var app = builder.Build();

// First in the pipeline, so everything after it sees the client's scheme and IP.
// Off in Development: nothing sits in front of Kestrel locally, and trusting the headers
// there would let any local tool spoof them.
if (!app.Environment.IsDevelopment())
{
    app.UseForwardedHeaders();
}

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseCors("web");

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapHealthEndpoints();

app.Run();

// Exposed for WebApplicationFactory in integration tests.
public partial class Program;
