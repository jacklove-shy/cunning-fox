import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Posts from './pages/Posts';
import PostDetail from './pages/PostDetail';
import Tools from './pages/Tools';
import ToolRunner from './pages/ToolRunner';
import Archives from './pages/Archives';
import Friends from './pages/Friends';
import Nav from './pages/Nav';
import Guestbook from './pages/Guestbook';
import About from './pages/About';
import License from './pages/License';
import Donate from './pages/Donate';
import Admin from './pages/Admin';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/posts" element={<Posts />} />
        <Route path="/posts/:slug" element={<PostDetail />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/tools/:slug" element={<ToolRunner />} />
        <Route path="/archives" element={<Archives />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/nav" element={<Nav />} />
        <Route path="/guestbook" element={<Guestbook />} />
      <Route path="/about" element={<About />} />
        <Route path="/license" element={<License />} />
        <Route path="/donate" element={<Donate />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
