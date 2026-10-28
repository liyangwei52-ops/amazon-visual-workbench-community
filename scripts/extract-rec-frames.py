# 抽帧录屏：查看用户录屏界面内容
import os
import av

VIDEO = r"C:\Users\WIN10\AppData\Roaming\LarkShell\screenshot\20261012144507_rec_.mp4"
OUT = r"G:\2026\10月\shhshs\amazon-visual-workbench\scripts\rec-frames"
os.makedirs(OUT, exist_ok=True)

with av.open(VIDEO) as container:
    duration = float(container.duration) / av.time_base if container.duration else 0
    stream = container.streams.video[0]
    fps = float(stream.average_rate)
    print(f"duration={duration:.1f}s fps={fps:.1f} width={stream.width} height={stream.height}")

    # 最多取 12 帧均匀覆盖
    frame_count = 12
    step = max(1.0, duration / frame_count)
    targets = [i * step for i in range(frame_count)]
    target_idx = 0

    for frame in container.decode(stream):
        t = float(frame.pts * stream.time_base)
        if target_idx < len(targets) and t >= targets[target_idx]:
            img = frame.to_image()
            out_path = os.path.join(OUT, f"frame_{target_idx:02d}_t{t:.1f}s.png")
            img.save(out_path)
            print(f"saved {out_path}")
            target_idx += 1
            if target_idx >= len(targets):
                break
