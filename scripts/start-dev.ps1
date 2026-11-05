function Invoke-SeverModulDevSetup {
  $ErrorActionPreference = "Stop"
  $proxyUrl = "http://127.0.0.1:10809"
  $proxyUri = [Uri]$proxyUrl

  try {
    $proxyConnection = Test-NetConnection -ComputerName $proxyUri.Host `
      -Port $proxyUri.Port -WarningAction SilentlyContinue
    if (-not $proxyConnection.TcpTestSucceeded) {
      throw "Локальный прокси $proxyUrl недоступен. Запустите прокси и повторите команду."
    }

    $bypassEntries = @(
      [Environment]::GetEnvironmentVariable("NO_PROXY", "Process")
      [Environment]::GetEnvironmentVariable("no_proxy", "Process")
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      ForEach-Object { $_ -split "," } |
      ForEach-Object { $_.Trim().TrimStart(".") } |
      Where-Object { $_ }
    if ($bypassEntries | Where-Object {
        $_ -eq "*" -or $_ -eq "neon.tech" -or $_ -eq "console.neon.tech" -or
        $_ -eq "compute.neon.tech" -or $_.EndsWith(".neon.tech", [StringComparison]::OrdinalIgnoreCase)
      }) {
      throw "NO_PROXY исключает Neon из прокси. Удалите это исключение только в текущей сессии и повторите команду."
    }

    $env:HTTP_PROXY = $proxyUrl
    $env:HTTPS_PROXY = $proxyUrl
    $env:ALL_PROXY = $proxyUrl
    $env:http_proxy = $proxyUrl
    $env:https_proxy = $proxyUrl
    $env:all_proxy = $proxyUrl

    $nodeOptions = $env:NODE_OPTIONS
    if ($nodeOptions -match "(?i)(^|\s)--no-use-env-proxy(\s|$)") {
      $nodeOptions = [Regex]::Replace(
        $nodeOptions,
        "(?i)(^|\s)--no-use-env-proxy(?=\s|$)",
        " "
      ).Trim()
    }
    if ($nodeOptions -notmatch "(?i)(^|\s)--use-env-proxy(\s|$)") {
      $nodeOptions = (@($nodeOptions, "--use-env-proxy") |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join " "
    }
    $env:NODE_OPTIONS = $nodeOptions

    $nodeVersion = (& node --version 2>$null)
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch "^v24\.") {
      throw "Требуется доступный Node.js 24 с поддержкой --use-env-proxy."
    }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
      throw "npm не найден в PATH текущей сессии."
    }
    if (-not (Get-Command neonctl -ErrorAction SilentlyContinue)) {
      throw "Neon CLI (neonctl) не найден в PATH текущей сессии."
    }

    foreach ($setting in @("proxy", "https-proxy")) {
      $configuredValue = (& npm config get $setting 2>$null)
      if ($LASTEXITCODE -ne 0) {
        throw "Не удалось безопасно проверить настройку npm proxy."
      }
      if ($configuredValue -and $configuredValue -ne "null") {
        try {
          $configuredUri = [Uri]$configuredValue
          if ($configuredUri.Host -ne $proxyUri.Host -or
              $configuredUri.Port -ne $proxyUri.Port -or
              $configuredUri.UserInfo) {
            throw "В npm задан отдельный proxy. Проверьте конфигурацию npm вручную; её значение не показывается."
          }
        } catch {
          if ($_.Exception.Message -like "В npm задан отдельный proxy*") {
            throw
          }
          throw "В npm задан proxy, который нельзя безопасно сопоставить с локальным прокси; значение не показывается."
        }
      }
    }

    if ($env:HTTP_PROXY -ne $proxyUrl -or $env:HTTPS_PROXY -ne $proxyUrl -or
        $env:NODE_OPTIONS -notmatch "(?i)(^|\s)--use-env-proxy(\s|$)") {
      throw "Не удалось установить согласованные proxy-переменные текущей сессии."
    }

    Write-Host "Прокси для этой PowerShell-сессии настроен: $proxyUrl"
    Write-Host "Node.js: $nodeVersion; NODE_OPTIONS включает --use-env-proxy."
    Write-Host "npm и Neon CLI найдены; секретные значения не проверяются и не выводятся."

    & (Join-Path $PSScriptRoot "check-network.ps1")
    if ($LASTEXITCODE -ne 0) {
      throw "Сетевая проверка завершилась ошибкой."
    }

    $null = & neonctl me 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "Не удалось выполнить read-only проверку Neon CLI. Детали вывода скрыты."
    }

    $projectOutput = @(& neonctl --output json projects list 2>$null)
    if ($LASTEXITCODE -ne 0) {
      throw "Не удалось получить список проектов через Neon CLI. Детали вывода скрыты."
    }
    try {
      $projects = ($projectOutput -join "`n") | ConvertFrom-Json
    } catch {
      throw "Neon CLI вернул неожиданный формат списка проектов."
    }
    $projectFound = [bool](@($projects) | Where-Object {
      $_.id -eq "rough-star-31924143" -or $_.project_id -eq "rough-star-31924143"
    })
    if (-not $projectFound) {
      throw "Авторизация Neon прошла, но доступ к заданному проекту не подтверждён."
    }

    $branchOutput = @(& neonctl --output json branches list `
      --project-id "rough-star-31924143" 2>$null)
    if ($LASTEXITCODE -ne 0) {
      throw "Не удалось проверить ветки проекта через Neon CLI. Детали вывода скрыты."
    }
    try {
      $branches = ($branchOutput -join "`n") | ConvertFrom-Json
    } catch {
      throw "Neon CLI вернул неожиданный формат списка веток."
    }
    $branchFound = [bool](@($branches) | Where-Object {
      $_.id -eq "br-lingering-bird-b2kw6c2d" -or
      $_.branch_id -eq "br-lingering-bird-b2kw6c2d" -or
      $_.name -eq "br-lingering-bird-b2kw6c2d"
    })
    if (-not $branchFound) {
      throw "Доступ к проекту есть, но тестовая ветка не найдена или недоступна."
    }

    Write-Host "Neon CLI: OAuth-проверка успешна; тестовый проект и ветка доступны."
    Write-Host "Среда подготовлена. Все изменения ограничены текущей PowerShell-сессией."
    return $true
  } catch {
    Write-Host ("Подготовка среды остановлена: " + $_.Exception.Message) -ForegroundColor Red
    return $false
  }
}

$setupSucceeded = Invoke-SeverModulDevSetup
Remove-Item Function:\Invoke-SeverModulDevSetup -ErrorAction SilentlyContinue
if (-not $setupSucceeded) {
  Write-Host "Рабочую среду не считать подготовленной; прямое подключение не включалось." -ForegroundColor Yellow
}
