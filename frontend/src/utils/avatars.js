// Kullanıcı avatarları — src/assets/avatars altındaki PNG'ler (Vite ile bundle edilir).
// users/{uid}.avatar alanında id (ör. 'luna') saklanır; gösterimde getAvatarSrc ile çözülür.
import axel from '../assets/avatars/axel.png';
import dax from '../assets/avatars/dax.png';
import eda from '../assets/avatars/eda.png';
import ivy from '../assets/avatars/ivy.png';
import kai from '../assets/avatars/kai.png';
import luna from '../assets/avatars/luna.png';
import mira from '../assets/avatars/mira.png';
import nova from '../assets/avatars/nova.png';
import omar from '../assets/avatars/omar.png';
import theo from '../assets/avatars/theo.png';
import zara from '../assets/avatars/zara.png';
import zeno from '../assets/avatars/zeno.png';

export const AVATARS = [
  { id: 'axel', src: axel, label: 'Axel' },
  { id: 'dax', src: dax, label: 'Dax' },
  { id: 'eda', src: eda, label: 'Eda' },
  { id: 'ivy', src: ivy, label: 'Ivy' },
  { id: 'kai', src: kai, label: 'Kai' },
  { id: 'luna', src: luna, label: 'Luna' },
  { id: 'mira', src: mira, label: 'Mira' },
  { id: 'nova', src: nova, label: 'Nova' },
  { id: 'omar', src: omar, label: 'Omar' },
  { id: 'theo', src: theo, label: 'Theo' },
  { id: 'zara', src: zara, label: 'Zara' },
  { id: 'zeno', src: zeno, label: 'Zeno' },
];

export const getAvatarSrc = (id) => AVATARS.find((a) => a.id === id)?.src || null;

export default AVATARS;
