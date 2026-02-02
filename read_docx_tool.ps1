
$outputFile = "c:/Antigravity/specify-powerautomate/docx_content.txt"
$errorActionPreference = "Stop"

function Write-Log {
    param($Message)
    Write-Host $Message
    Add-Content -Path $outputFile -Value $Message -Encoding UTF8
}

if (Test-Path $outputFile) { Remove-Item $outputFile }

Add-Type -AssemblyName System.IO.Compression.FileSystem

$paths = $args

if ($paths.Count -eq 0) {
    Write-Log "No files provided."
    exit
}

foreach ($filePath in $paths) {
    if (-not (Test-Path $filePath)) {
        Write-Log "File not found: $filePath"
        continue
    }

    $fileName = [System.IO.Path]::GetFileName($filePath)
    Write-Log "--- CONTENT OF $fileName ---"

    $tempPath = [System.IO.Path]::GetTempFileName()
    $extractPath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), [System.IO.Path]::GetRandomFileName())
    
    try {
        Copy-Item $filePath $tempPath
        $zipPath = $tempPath + ".zip"
        Rename-Item $tempPath $zipPath
        
        [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $extractPath)
        
        $xmlPath = Join-Path $extractPath "word/document.xml"
        
        if (Test-Path $xmlPath) {
            # Read Raw content
            $xmlContent = Get-Content $xmlPath -Raw -Encoding UTF8
            
            # Simple Regex to extract text from <w:t> tags
            # Covers <w:t>text</w:t> and <w:t xml:space="preserve">text</w:t>
            # Use dotall mode (?s) for regex to match across newlines if any (though usually one line)
            
             # Use a robust regex to just grab text inside w:t
             $matches = [regex]::Matches($xmlContent, '<w:t[^>]*>(.*?)</w:t>')
             $textBuilder = [System.Text.StringBuilder]::new()
             
             foreach ($m in $matches) {
                 [void]$textBuilder.Append($m.Groups[1].Value)
             }
             
             # This creates one giant line. It's hard to read.
             # Let's try to preserve paragraphs using w:p
             
             $pMatches = [regex]::Matches($xmlContent, '<w:p.*?</w:p>')
             foreach ($pm in $pMatches) {
                 $pContent = $pm.Value
                 $tMatches = [regex]::Matches($pContent, '<w:t[^>]*>(.*?)</w:t>')
                 $lineText = ""
                 foreach ($tm in $tMatches) {
                     $lineText += $tm.Groups[1].Value
                 }
                 if ($lineText.Length -gt 0) {
                     Add-Content -Path $outputFile -Value $lineText -Encoding UTF8
                 }
             }

        } else {
            Write-Log "Could not find word/document.xml in $fileName"
        }
        
    } catch {
        Write-Log "Error processing $fileName : $_"
    } finally {
        if (Test-Path $extractPath) { Remove-Item $extractPath -Recurse -Force -ErrorAction SilentlyContinue }
        if (Test-Path $zipPath) { Remove-Item $zipPath -Force -ErrorAction SilentlyContinue }
    }
    
    Write-Log "--- END OF $fileName ---`n"
}
