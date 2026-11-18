# Ejecutar desde una terminal local con Node, Git y acceso de escritura a GitHub.
# Solo publica si el remoto sigue vacío. No fuerza pushes ni modifica el Git local.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$remote = 'https://github.com/JoseAQuinto/Automatizacion_gmail.git'

function Invoke-CheckedGit {
    param([string[]] $Arguments)
    & git @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Git no pudo completar la operación. No se ha forzado ningún cambio remoto.' }
}

Get-Command git, node -ErrorAction Stop | Out-Null
$remoteRefs = @(& git ls-remote $remote)
if ($LASTEXITCODE -ne 0) { throw 'No se pudo leer el remoto. Comprueba conexión y autenticación con GitHub.' }
if ($remoteRefs.Count -gt 0) {
    throw 'El repositorio remoto ya contiene referencias. Revisa su contenido antes de incorporar estos archivos; este script no lo sobrescribe.'
}

$publicFiles = @(
    '.env.example', '.gitignore', 'AGENT_RUNBOOK.md', 'CLAUDE.md',
    'README.md', 'Publicar.ps1', 'package.json', 'package-lock.json', 'tsconfig.json'
)
$publicDirectories = @('.github', 'config', 'scripts', 'src', 'tests')
$publicationRoot = Join-Path $projectRoot '.work'
New-Item -ItemType Directory -Path $publicationRoot -Force | Out-Null
$checkout = Join-Path $publicationRoot ('publication-' + [guid]::NewGuid().ToString('N'))
Invoke-CheckedGit -Arguments @('-c', 'init.defaultBranch=main', 'clone', '--', $remote, $checkout)
foreach ($name in $publicFiles + $publicDirectories) {
    $source = Join-Path $projectRoot $name
    if (-not (Test-Path -LiteralPath $source)) { throw "Falta un archivo publicable: $name" }
    Copy-Item -LiteralPath $source -Destination (Join-Path $checkout $name) -Recurse
}

Push-Location -LiteralPath $checkout
try {
    Invoke-CheckedGit -Arguments (@('add', '--') + $publicFiles + $publicDirectories)
    & node scripts/check-secrets.mjs
    if ($LASTEXITCODE -ne 0) { throw 'La revisión de secretos ha fallado. Publicación cancelada.' }
    Invoke-CheckedGit -Arguments @('diff', '--cached', '--check')
    Invoke-CheckedGit -Arguments @('commit', '-m', 'Implement assisted Google registration with encrypted profiles and controlled tests')
    Invoke-CheckedGit -Arguments @('push', '--set-upstream', 'origin', 'HEAD:main')
    $localCommit = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo leer el commit local.' }
    $publishedRefs = @(& git ls-remote $remote refs/heads/main)
    if ($LASTEXITCODE -ne 0 -or $publishedRefs.Count -ne 1 -or ($publishedRefs[0] -split '\s+')[0] -ne $localCommit) {
        throw 'El push terminó, pero no se pudo verificar el commit remoto. Revisa GitHub antes de reintentar.'
    }
    Write-Host "Publicado y verificado en main: $localCommit"
    Write-Host "Checkout sincronizado disponible en: $checkout"
} finally {
    Pop-Location
}
