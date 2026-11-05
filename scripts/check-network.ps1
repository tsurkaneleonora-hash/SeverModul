param()

$ErrorActionPreference = "Stop"
$neonHost = "console.neon.tech"
$proxyUrl = "http://127.0.0.1:10809"
$proxyUri = [Uri]$proxyUrl

function Get-NeonHttpStatus {
  param(
    [Parameter(Mandatory = $true)][string]$Route,
    [Parameter(Mandatory = $true)][bool]$UseProxy
  )

  $request = [System.Net.HttpWebRequest]::Create("https://$neonHost/api/v2/projects")
  $request.Method = "GET"
  $request.Timeout = 15000
  $request.ReadWriteTimeout = 15000
  $request.AllowAutoRedirect = $false
  if ($UseProxy) {
    $request.Proxy = [System.Net.WebProxy]::new($proxyUrl)
  } else {
    $request.Proxy = $null
  }

  try {
    $response = $request.GetResponse()
    $status = [int]$response.StatusCode
    $response.Close()
    return [pscustomobject]@{ route = $Route; status = $status; tls = "успешно" }
  } catch [System.Net.WebException] {
    if ($_.Exception.Response) {
      $response = $_.Exception.Response
      $status = [int]$response.StatusCode
      $response.Close()
      return [pscustomobject]@{ route = $Route; status = $status; tls = "успешно" }
    }
    return [pscustomobject]@{ route = $Route; status = "нет HTTP-ответа"; tls = "не подтверждено" }
  }
}

try {
  $proxyConnection = Test-NetConnection -ComputerName $proxyUri.Host `
    -Port $proxyUri.Port -WarningAction SilentlyContinue
  if (-not $proxyConnection.TcpTestSucceeded) {
    throw "Прокси $proxyUrl недоступен. Проверка остановлена; прямое подключение не выполнялось."
  }
  Write-Host "Локальный прокси: TCP доступен ($proxyUrl)." -ForegroundColor Green

  $dnsAnswers = @(Resolve-DnsName -Name $neonHost -Type A -ErrorAction Stop |
    Where-Object { $_.IPAddress } |
    Select-Object -ExpandProperty IPAddress -Unique)
  if ($dnsAnswers.Count -eq 0) {
    throw "DNS не вернул IPv4-адрес для $neonHost."
  }
  Write-Host "DNS: $neonHost разрешается ($($dnsAnswers.Count) IPv4-адреса)." -ForegroundColor Green

  if ($env:HTTP_PROXY -ne $proxyUrl -or $env:HTTPS_PROXY -ne $proxyUrl) {
    throw "HTTP_PROXY и HTTPS_PROXY текущей сессии не указывают на локальный прокси."
  }
  Write-Host "Proxy environment: HTTP_PROXY и HTTPS_PROXY настроены." -ForegroundColor Green

  $apiResult = Get-NeonHttpStatus -Route "PowerShell через прокси" -UseProxy $true
  Write-Host ("Neon API: HTTP {0}; TLS-проверка сертификата {1}." -f `
    $apiResult.status, $apiResult.tls)
  if ($apiResult.status -eq "нет HTTP-ответа") {
    throw "Через прокси не получен HTTP-ответ Neon API."
  }

  $node = Get-Command node -ErrorAction Stop
  $nodeProbe = "fetch('https://console.neon.tech/api/v2/projects',{signal:AbortSignal.timeout(15000)}).then(r=>console.log('STATUS:'+r.status)).catch(e=>{console.log('ERROR:'+(e.cause?.code||e.name));process.exitCode=1})"
  $nodeOutput = @(& $node.Source --use-env-proxy -e $nodeProbe 2>$null)
  $nodeExit = $LASTEXITCODE
  $nodeStatus = $null
  foreach ($line in $nodeOutput) {
    if ($line -match "^STATUS:(\d{3})$") {
      $nodeStatus = [int]$Matches[1]
      break
    }
  }
  if ($nodeExit -ne 0 -or $null -eq $nodeStatus) {
    throw "Node.js fetch через proxy-переменные не прошёл. Подробности сетевой ошибки не выводятся."
  }
  Write-Host ("Node.js fetch через --use-env-proxy: HTTP {0}." -f $nodeStatus) -ForegroundColor Green
  Write-Host "HTTP 401 для анонимного запроса означает ответ API без авторизации, а не отказ TLS."
  return
} catch {
  Write-Host ("Сетевая проверка остановлена: " + $_.Exception.Message) -ForegroundColor Red
  throw
}
