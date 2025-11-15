<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Windows & Dual-Boot Recovery Guide</title>
<style>
  body { font-family: Arial, sans-serif; background: #0e0e0e; color: #e0e0e0; line-height: 1.6; margin: 40px; }
  h1, h2 { color: #00b4ff; }
  h1 { border-bottom: 2px solid #00b4ff; padding-bottom: 5px; }
  code { background: #1a1a1a; padding: 2px 4px; border-radius: 4px; color: #b8ffb8; }
  pre { background: #1a1a1a; padding: 10px; border-radius: 5px; overflow-x: auto; color: #b8ffb8; }
  ul { margin-bottom: 20px; }
  li { margin-bottom: 6px; }
  .fix { color: #00ff80; font-weight: bold; }
  .warn { color: #ff8080; }
</style>
</head>
<body>
<h1>Windows & Dual-Boot Troubleshooting Log</h1>

<p>This document summarizes the real issues encountered during your dual-boot (Windows + Mint) repair process, with each problem followed by the applied fix or method used. It serves as a reference for EFI, GRUB, BCD, and reinstall procedures.</p>

<h2>1. GRUB Boot Cleanup (Dual Boot with Mint)</h2>
<ul>
  <li><strong>Problem:</strong> Cluttered GRUB menu with multiple or broken Windows entries.</li>
  <li class="fix">Fix: Boot into Mint → Run <code>sudo update-grub</code> to regenerate menu and remove stale entries.</li>
  <li>Optional: Disable OS prober via <code>chmod -x /etc/grub.d/30_os-prober</code> to hide Windows temporarily.</li>
</ul>

<h2>2. GRUB Repair from Live Environment</h2>
<ul>
  <li><strong>Problem:</strong> GRUB2 missing or corrupted, no OS booting.</li>
  <li class="fix">Fix:
    <pre>
sudo mount /dev/sdXY /mnt
sudo mount /dev/sdXZ /mnt/boot/efi
for i in /dev /dev/pts /proc /sys /run; do sudo mount --bind $i /mnt$i; done
sudo chroot /mnt
grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id=ubuntu
update-grub
exit && reboot
    </pre>
  </li>
</ul>

<h2>3. EFI Partition Visibility Issue</h2>
<ul>
  <li><strong>Problem:</strong> EFI System Partition appeared in Windows as <code>F:</code>, risking accidental formatting.</li>
  <li class="fix">Fix:
    <pre>
diskpart
list vol
sel vol 3
remove letter=F
exit
    </pre>
    → Partition hidden again and system booted normally.
  </li>
</ul>

<h2>4. Duplicate “Windows 10” Entries</h2>
<ul>
  <li><strong>Problem:</strong> Boot menu showed multiple Windows 10 instances after failed installs.</li>
  <li class="fix">Fix: Manually inspected and deleted duplicates:
    <pre>
bcdedit /store S:\EFI\Microsoft\Boot\BCD /enum all
bcdedit /store S:\EFI\Microsoft\Boot\BCD /delete {GUID}
    </pre>
    Retained only one <code>Windows Boot Loader</code> entry pointing to <code>C:\Windows</code>.
  </li>
</ul>

<h2>5. Windows Installer Failing After Reboot (WIMBOOT Mode)</h2>
<ul>
  <li><strong>Problem:</strong> Windows Setup rebooted into error (no boot device / 0xc000000f).</li>
  <li class="fix">Cause: EFI bootloader not written to disk during WIMBOOT session. Fixed with:
    <pre>
diskpart
sel vol <EFI volume>
assign letter=S:
bcdboot C:\Windows /s S: /f UEFI
    </pre>
    → Rebuilt the boot files and continued installation.
  </li>
</ul>

<h2>6. Multiple “Windows Boot Manager” Entries in BIOS</h2>
<ul>
  <li><strong>Problem:</strong> EFI NVRAM had several redundant entries.</li>
  <li class="fix">Fix (Linux):
    <pre>
sudo efibootmgr
sudo efibootmgr -b 0002 -B
    </pre>
    → Cleaned duplicate UEFI boot entries.
  </li>
</ul>

<h2>7. Complete Wipe and Reinstall</h2>
<ul>
  <li><strong>Problem:</strong> Broken BCD store and repeated install loops.</li>
  <li class="fix">Fix: Booted from Windows USB → “Custom Install” → Deleted <em>all partitions</em> until “Unallocated Space” → Clicked Next.
    <br>Windows recreated EFI, MSR, Primary, and Recovery partitions automatically.
  </li>
  <li>Removed USB before first reboot to prevent duplicate BCD creation.</li>
</ul>

<h2>8. Post-Install Verification</h2>
<ul>
  <li><strong>Problem:</strong> Need to confirm clean EFI and single boot entry.</li>
  <li class="fix">Fix:
    <pre>
bcdedit /enum
    </pre>
    Output verified one <code>Windows Boot Manager</code> and one <code>Windows Boot Loader</code> entry only.
  </li>
</ul>

<h2>9. Summary of Tools & Commands Used</h2>
<ul>
  <li><code>diskpart</code> — manage partitions and remove drive letters</li>
  <li><code>bcdedit</code> — inspect and edit Windows boot configuration</li>
  <li><code>bcdboot</code> — rebuild Windows boot files</li>
  <li><code>efibootmgr</code> — manage UEFI boot entries</li>
  <li><code>grub-install</code> / <code>update-grub</code> — rebuild Linux bootloader</li>
</ul>

<h2>Final System State</h2>
<ul>
  <li>One EFI System Partition (FAT32, hidden)</li>
  <li>One Windows Boot Manager entry</li>
  <li>Stable dual-boot (Mint + Windows) environment</li>
  <li>No duplicate or failed installer remnants</li>
</ul>

<hr>
<p><small>Document auto-generated from troubleshooting session logs.
Keep a backup of this HTML and your EFI partition for future recovery.</small></p>

</body>
</html>
