import { Comments } from '../components/Comments';

export default function Guestbook() {
  return (
    <div className="wrap max-w-3xl pt-10">
      <header className="mb-4 border-b pb-6" style={{ borderColor: 'var(--line)' }}>
        <p className="kicker">guestbook</p>
        <h1 className="mt-2.5 h1">留言板</h1>
        <p className="mt-2 lede">
          随便聊聊：催更、提问、交换友链都行。看到感兴趣的留言可以直接回复。
        </p>
      </header>

      <Comments heading="留言" />
    </div>
  );
}
