/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, Component, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShoppingCart, ChevronRight, CheckCircle2, ArrowLeft, Coffee, Utensils, 
  Zap, Leaf, Star, Plus, Minus, User, CreditCard, Phone, Mail, 
  Upload, MapPin, Truck, Building2, FileText, Send, Edit3, LogIn, LogOut, AlertTriangle, Loader2
} from 'lucide-react';
import { auth, db, storage } from './firebase';
import { 
  signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User as FirebaseUser 
} from 'firebase/auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
// --- End Error Handling ---

type Screen = 'inicio' | 'productos' | 'formulario' | 'confirmacion' | 'exito';

interface Product {
  id: number;
  name: string;
  price: number;
  description: string;
  icon: React.ReactNode;
  image: string;
}

interface FormData {
  nombre: string;
  cedula: string;
  celular: string;
  correo: string;
  cuotas: number;
  archivo: File | null;
  entregaTipo: 'sede' | 'domicilio';
  sede: string;
  ciudad: string;
  direccion: string;
  barrio: string;
  localidad: string;
}

const DISCOUNT_RATE = 0.125; // 12.5%

const PRODUCTS: Product[] = [
  {
    id: 1,
    name: "Sobre (7 Láminas)",
    price: 5000,
    description: "Sobre individual con 7 láminas oficiales Panini.",
    icon: <Zap className="w-5 h-5" />,
    image: "https://paninitienda.com/cdn/shop/files/Sticker-Packet-LATAM---Several_1.jpg?v=1775495858&width=700"
  },
  {
    id: 2,
    name: "Caja / Display (104 Sobres)",
    price: 520000,
    description: "Caja completa con 104 sobres para coleccionistas.",
    icon: <Building2 className="w-5 h-5" />,
    image: "https://paninitienda.com/cdn/shop/files/Display-1_04a6437d-2265-45e6-b9db-8f2cc207b620.png?v=1775495858&width=700"
  },
  {
    id: 3,
    name: "Paca (10 Cajas)",
    price: 5200000,
    description: "Paca mayorista que contiene 10 cajas (1040 sobres).",
    icon: <Truck className="w-5 h-5" />,
    image: "https://www.tiendaeltiempo.com/media/catalog/product/cache/7c8143d721d17ea041602cd5c0977799/f/w/fwc26_render_box100__1000x1000_1_1.webp"
  },
  {
    id: 4,
    name: "Albúm Pasta Blanda",
    price: 14900,
    description: "Versión estándar del álbum oficial Panini.",
    icon: <FileText className="w-5 h-5" />,
    image: "https://paninitienda.com/cdn/shop/files/SoftCover-LATAM_Chile---Upright.jpg?v=1775075148&width=700"
  },
  {
    id: 5,
    name: "Albúm Pasta Dura",
    price: 49900,
    description: "Edición de lujo con pasta dura para mayor durabilidad.",
    icon: <Star className="w-5 h-5" />,
    image: "https://paninitienda.com/cdn/shop/files/HardCoverLATAM_Chile---Upright.jpg?v=1775074775&width=700"
  }
];

const SEDES = ["Sede Norte (Bogotá)", "Sede Chapinero (Bogotá)", "Sede Poblado (Medellín)", "Sede Cali Centro", "Sede Bucaramanga"];
const CIUDADES = ["Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena", "Bucaramanga", "Pereira", "Manizales", "Cúcuta", "Ibagué", "Santa Marta", "Villavicencio"];

export default function App() {
  const [screen, setScreen] = useState<Screen>('inicio');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sendingStatus, setSendingStatus] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    console.log(msg);
    setDebugLogs(prev => [...prev.slice(-4), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };
  const [cart, setCart] = useState<{ [id: number]: number }>({});
  const [formData, setFormData] = useState<FormData>({
    nombre: '',
    cedula: '',
    celular: '',
    correo: '',
    cuotas: 1,
    archivo: null,
    entregaTipo: 'sede',
    sede: SEDES[0],
    ciudad: CIUDADES[0],
    direccion: '',
    barrio: '',
    localidad: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to top when screen changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Test connection to Firestore on mount
  useEffect(() => {
    const testConnection = async () => {
      try {
        const { getDocFromServer, doc } = await import('firebase/firestore');
        // Intentamos leer un documento inexistente para probar la conexión
        await getDocFromServer(doc(db, '_connection_test_', 'ping'));
        console.log("Conexión a Firestore verificada.");
      } catch (error: any) {
        // Si el error es 'the client is offline', es un problema de config o red
        if (error.message?.includes('the client is offline')) {
          console.error("Error de conexión inicial: El cliente está offline.");
          setSubmitError("No se pudo conectar con la base de datos. Verifica tu conexión o configuración de Firebase.");
        }
      }
    };
    testConnection();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error al iniciar sesión:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setScreen('inicio');
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart(prev => {
      const currentQty = prev[productId] || 0;
      const newQty = Math.max(0, currentQty + delta);
      if (newQty === 0) {
        const { [productId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [productId]: newQty };
    });
  };

  const selectedProducts = PRODUCTS.filter(p => cart[p.id] > 0);
  const subtotalOriginal = selectedProducts.reduce((sum, p) => sum + (p.price * cart[p.id]), 0);
  const subtotal = subtotalOriginal * (1 - DISCOUNT_RATE);
  const costoEnvio = formData.entregaTipo === 'domicilio' 
    ? (formData.ciudad === 'Bogotá' ? 5000 : 10000) 
    : 0;
  const totalPrice = subtotal + costoEnvio;
  const totalItems: number = selectedProducts.reduce((sum, p) => sum + (cart[p.id] || 0), 0);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData(prev => ({ ...prev, archivo: e.target.files![0] }));
    }
  };

  const isFormValid = formData.nombre && formData.cedula && formData.celular && formData.correo && 
    (formData.entregaTipo === 'sede' ? formData.sede : (formData.ciudad && formData.direccion && formData.barrio && formData.localidad));

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#2d3436] font-sans selection:bg-red-100 pb-32">
      <AnimatePresence mode="wait">
        {screen === 'inicio' && (
          <motion.div
            key="inicio"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center justify-center min-h-screen p-6 text-center"
          >
            <div className="max-w-2xl">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="relative w-full max-w-lg mx-auto mb-12 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-red-200/50 group"
              >
                <img 
                  src="https://digitalhub.fifa.com/transform/598a1d22-62b6-486b-849c-e8bf55894179/FIFA_FWC26_Tournament-Thumbnail-4-3?&io=transform:fill,aspectratio:4x3,width:540&quality=75"
                  alt="FIFA World Cup 26"
                  referrerPolicy="no-referrer"
                  className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </motion.div>

              <motion.div 
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-red-200"
              >
                <ShoppingCart className="w-8 h-8 text-white" />
              </motion.div>

              <h1 className="text-5xl font-black tracking-tight mb-4 text-[#1a1a1a] uppercase leading-tight">
                ¡COMPLETA TU <span className="text-red-600">PASIÓN PANINI!</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8 leading-relaxed max-w-md mx-auto">
                Vive la emoción de coleccionar. Adquiere tus productos oficiales con beneficios exclusivos para la comunidad FONCLARO.
              </p>
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4 mb-10 flex items-center justify-center gap-3 text-red-700 max-w-sm mx-auto">
                <Star className="w-5 h-5 fill-red-600" />
                <span className="font-bold text-sm">Beneficio FONCLARO: 12.5% de descuento aplicado</span>
              </div>
              <button
                onClick={() => setScreen('productos')}
                className="group relative w-full max-w-xs py-5 px-8 bg-[#1a1a1a] text-white rounded-2xl font-bold text-xl overflow-hidden transition-all hover:bg-black active:scale-[0.98] shadow-xl shadow-black/10"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  ¡Empezar mi Colección!
                  <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-red-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          </motion.div>
        )}

        {screen === 'productos' && (
          <motion.div
            key="productos"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="max-w-5xl mx-auto p-6 py-12"
          >
            {/* Banner Superior Panini */}
            <div className="w-full mb-8 rounded-3xl overflow-hidden shadow-lg">
              <img 
                src="https://lh3.googleusercontent.com/d/1FAOfMqB0npo3MdOof9zgUqApMHUmY47a"
                alt="Panini Distribuidor Banner"
                referrerPolicy="no-referrer"
                className="w-full h-auto object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://picsum.photos/seed/panini-banner/1200/300";
                }}
              />
            </div>

            <div className="relative w-full h-64 md:h-80 rounded-[2.5rem] overflow-hidden mb-12 shadow-2xl group">
              <img 
                src="https://digitalhub.fifa.com/transform/4e4717fc-7f87-4ea4-b989-7f5730ec94ae/General-Graphic-3840-x-2160-8?&io=transform:fill,height:910,width:1536&quality=75"
                alt="Panini Banner"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-8 left-8 right-8">
                <h2 className="text-3xl md:text-4xl font-black text-white mb-2 uppercase tracking-tight">TESOROS PARA TU COLECCIÓN</h2>
                <p className="text-white/80 font-medium">Selecciona las láminas y álbumes que te faltan</p>
              </div>
            </div>

            <div className="flex items-center justify-between mb-8 px-2">
              <button 
                onClick={() => setScreen('inicio')}
                className="flex items-center gap-2 text-gray-500 hover:text-black transition-colors group font-medium"
              >
                <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                Volver al inicio
              </button>
            </div>

            <div className="flex flex-col gap-6 mb-12">
              {PRODUCTS.map((product) => {
                const quantity = cart[product.id] || 0;
                const isSelected = quantity > 0;
                return (
                  <motion.div
                    key={product.id}
                    whileHover={{ scale: 1.01 }}
                    className={`relative bg-white rounded-3xl overflow-hidden border-2 transition-all flex flex-col md:flex-row ${
                      isSelected ? 'border-red-600 shadow-lg shadow-red-100' : 'border-transparent shadow-sm hover:shadow-md'
                    }`}
                  >
                    <div className="relative w-full md:w-1/3 h-56 md:h-auto overflow-hidden">
                      <img 
                        src={product.image} 
                        alt={product.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://placehold.co/400x300/e11d48/ffffff?text=${encodeURIComponent(product.name)}`;
                        }}
                      />
                    </div>
                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold text-xl text-[#1a1a1a]">{product.name}</h3>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-400 line-through">${product.price.toLocaleString()}</span>
                            <span className="font-bold text-2xl text-red-600">${(product.price * (1 - DISCOUNT_RATE)).toLocaleString()}</span>
                          </div>
                        </div>
                        <p className="text-gray-500 mb-6 leading-relaxed">{product.description}</p>
                      </div>
                      
                      <div className="flex items-center justify-end gap-6">
                        <div className="flex items-center gap-4 bg-gray-50 p-2 rounded-2xl border border-gray-100">
                          <button 
                            onClick={() => updateQuantity(product.id, -1)}
                            className={`p-2 rounded-xl transition-colors ${quantity > 0 ? 'bg-white text-red-600 shadow-sm hover:bg-red-50' : 'text-gray-300'}`}
                            disabled={quantity === 0}
                          >
                            <Minus className="w-5 h-5" />
                          </button>
                          <span className="font-bold text-xl w-8 text-center">{quantity}</span>
                          <button 
                            onClick={() => updateQuantity(product.id, 1)}
                            className="p-2 bg-white text-red-600 rounded-xl shadow-sm hover:bg-red-50 transition-colors"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="absolute top-4 left-4">
                        <CheckCircle2 className="w-8 h-8 text-red-600 fill-white shadow-sm" />
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-gray-100 p-4 z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
              <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total con Descuento</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-[#1a1a1a]">${subtotal.toLocaleString()}</span>
                    <span className="text-sm text-gray-500 font-medium">({totalItems} items)</span>
                  </div>
                </div>
                <button
                  disabled={totalItems === 0}
                  onClick={() => setScreen('formulario')}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-3 py-4 px-10 rounded-2xl font-bold text-lg shadow-xl transition-all ${
                    totalItems > 0 
                      ? 'bg-red-600 text-white hover:bg-red-700 active:scale-95 shadow-red-200' 
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                  }`}
                >
                  Continuar Pedido
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {screen === 'formulario' && (
          <motion.div
            key="formulario"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="max-w-3xl mx-auto p-6 py-12"
          >
            <button 
              onClick={() => setScreen('productos')}
              className="flex items-center gap-2 text-gray-500 hover:text-black transition-colors mb-6 group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              Volver a productos
            </button>
            <h2 className="text-3xl font-bold text-[#1a1a1a] mb-8">Datos del Pedido</h2>

            <div className="bg-white rounded-[2rem] p-8 shadow-xl border border-gray-50 space-y-8">
              {/* Datos Personales */}
              <section className="space-y-4">
                <h3 className="text-lg font-bold flex items-center gap-2 text-red-600">
                  <User className="w-5 h-5" /> Datos Personales
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Nombre Completo</label>
                    <input 
                      type="text" name="nombre" value={formData.nombre} onChange={handleInputChange}
                      placeholder="Ej: Juan Pérez"
                      className="w-full p-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-red-600 focus:bg-white outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Cédula</label>
                    <input 
                      type="text" name="cedula" value={formData.cedula} onChange={handleInputChange}
                      placeholder="Número de identificación"
                      className="w-full p-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-red-600 focus:bg-white outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Celular</label>
                    <input 
                      type="tel" name="celular" value={formData.celular} onChange={handleInputChange}
                      placeholder="300 000 0000"
                      className="w-full p-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-red-600 focus:bg-white outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Correo Electrónico</label>
                    <input 
                      type="email" name="correo" value={formData.correo} onChange={handleInputChange}
                      placeholder="correo@ejemplo.com"
                      className="w-full p-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-red-600 focus:bg-white outline-none transition-all"
                    />
                  </div>
                </div>
              </section>

              {/* Financiación y Documentos */}
              <section className="space-y-4">
                <h3 className="text-lg font-bold flex items-center gap-2 text-red-600">
                  <CreditCard className="w-5 h-5" /> Financiación y Documentos
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Número de Cuotas</label>
                    <select 
                      name="cuotas" value={formData.cuotas} onChange={handleInputChange}
                      className="w-full p-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-red-600 focus:bg-white outline-none transition-all appearance-none"
                    >
                      {[...Array(12)].map((_, i) => (
                        <option key={i+1} value={i+1}>{i+1} {i === 0 ? 'Cuota' : 'Cuotas'}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Adjunte el convenio firmado</label>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full p-4 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 hover:border-red-600 hover:bg-red-50 cursor-pointer transition-all flex items-center gap-3"
                    >
                      <Upload className="w-5 h-5 text-gray-400" />
                      <span className="text-sm text-gray-500 truncate">
                        {formData.archivo ? formData.archivo.name : 'Subir PDF o Imagen'}
                      </span>
                      <input 
                        type="file" ref={fileInputRef} onChange={handleFileChange} 
                        accept="image/*,.pdf" className="hidden" 
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Lugar de Entrega */}
              <section className="space-y-4">
                <h3 className="text-lg font-bold flex items-center gap-2 text-red-600">
                  <MapPin className="w-5 h-5" /> Lugar de Entrega
                </h3>
                <div className="flex gap-4 p-1 bg-gray-100 rounded-2xl">
                  <button 
                    onClick={() => setFormData(prev => ({ ...prev, entregaTipo: 'sede' }))}
                    className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${formData.entregaTipo === 'sede' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}
                  >
                    <Building2 className="w-4 h-4" /> Recoger en Sede (Gratis)
                  </button>
                  <button 
                    onClick={() => setFormData(prev => ({ ...prev, entregaTipo: 'domicilio' }))}
                    className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${formData.entregaTipo === 'domicilio' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}
                  >
                    <Truck className="w-4 h-4" /> Domicilio (+${formData.ciudad === 'Bogotá' ? '5.000' : '10.000'})
                  </button>
                </div>

                {formData.entregaTipo === 'sede' ? (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Seleccione la Sede</label>
                    <select 
                      name="sede" value={formData.sede} onChange={handleInputChange}
                      className="w-full p-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-red-600 focus:bg-white outline-none transition-all appearance-none"
                    >
                      {SEDES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase ml-1">Ciudad</label>
                      <select 
                        name="ciudad" value={formData.ciudad} onChange={handleInputChange}
                        className="w-full p-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-red-600 focus:bg-white outline-none transition-all appearance-none"
                      >
                        {CIUDADES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase ml-1">Dirección</label>
                      <input 
                        type="text" name="direccion" value={formData.direccion} onChange={handleInputChange}
                        placeholder="Ej: Calle 123 # 45 - 67"
                        className="w-full p-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-red-600 focus:bg-white outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase ml-1">Barrio</label>
                      <input 
                        type="text" name="barrio" value={formData.barrio} onChange={handleInputChange}
                        className="w-full p-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-red-600 focus:bg-white outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase ml-1">Localidad / Comuna</label>
                      <input 
                        type="text" name="localidad" value={formData.localidad} onChange={handleInputChange}
                        className="w-full p-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-red-600 focus:bg-white outline-none transition-all"
                      />
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="mt-10 flex justify-center">
              <button
                disabled={!isFormValid}
                onClick={() => setScreen('confirmacion')}
                className={`flex items-center gap-3 py-4 px-12 rounded-2xl font-bold text-lg shadow-xl transition-all ${
                  isFormValid 
                    ? 'bg-red-600 text-white hover:bg-red-700 active:scale-95 shadow-red-200' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                }`}
              >
                Ver Resumen Final
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

        {screen === 'confirmacion' && (
          <motion.div
            key="confirmacion"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="max-w-3xl mx-auto p-6 py-12"
          >
            <div className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-2xl shadow-gray-200 border border-gray-50">
              <div className="text-center mb-10">
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <FileText className="w-10 h-10 text-red-600" />
                </div>
                <h2 className="text-3xl font-bold text-[#1a1a1a] mb-2">Resumen de la Operación</h2>
                <p className="text-gray-500">Verifica que toda la información sea correcta.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                {/* Datos del Cliente */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest border-b pb-2">Datos del Cliente</h4>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-bold">Nombre:</span> {formData.nombre}</p>
                    <p><span className="font-bold">Cédula:</span> {formData.cedula}</p>
                    <p><span className="font-bold">Celular:</span> {formData.celular}</p>
                    <p><span className="font-bold">Correo:</span> {formData.correo}</p>
                    <p><span className="font-bold">Cuotas:</span> {formData.cuotas}</p>
                    <p><span className="font-bold">Convenio:</span> {formData.archivo ? formData.archivo.name : 'No adjunto'}</p>
                  </div>
                </div>

                {/* Datos de Entrega */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest border-b pb-2">Lugar de Entrega</h4>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-bold">Tipo:</span> {formData.entregaTipo === 'sede' ? 'Recogida en Sede' : 'Domicilio'}</p>
                    {formData.entregaTipo === 'sede' ? (
                      <p><span className="font-bold">Sede:</span> {formData.sede}</p>
                    ) : (
                      <>
                        <p><span className="font-bold">Ciudad:</span> {formData.ciudad}</p>
                        <p><span className="font-bold">Dirección:</span> {formData.direccion}</p>
                        <p><span className="font-bold">Barrio:</span> {formData.barrio}</p>
                        <p><span className="font-bold">Localidad:</span> {formData.localidad}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Productos */}
              <div className="space-y-4 mb-10">
                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest border-b pb-2">Productos Seleccionados</h4>
                <div className="space-y-3">
                  {selectedProducts.map((product) => {
                    const quantity = cart[product.id] || 0;
                    return (
                      <div key={product.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                        <div className="flex items-center gap-4">
                          <div>
                            <p className="font-bold text-[#1a1a1a]">{product.name}</p>
                            <p className="text-xs text-gray-400 uppercase tracking-widest">CANTIDAD: {quantity}</p>
                          </div>
                        </div>
                        <span className="font-bold text-gray-700">${(product.price * quantity).toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Totales */}
              <div className="border-t border-dashed border-gray-200 pt-8 mb-10">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-500">Subtotal Original</span>
                  <span className="font-medium line-through text-gray-400">${subtotalOriginal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-red-600 font-bold">Descuento FONCLARO (12.5%)</span>
                  <span className="text-red-600 font-bold">-${(subtotalOriginal * DISCOUNT_RATE).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center mb-6">
                  <span className="text-gray-500">Costo de Envío</span>
                  <span className={costoEnvio === 0 ? "text-green-600 font-medium" : "font-medium"}>
                    {costoEnvio === 0 ? 'Gratis' : `$${costoEnvio.toLocaleString()}`}
                  </span>
                </div>
                <div className="flex justify-between items-center p-6 bg-red-50 rounded-3xl">
                  <span className="text-xl font-bold text-[#1a1a1a]">Total Final</span>
                  <span className="text-3xl font-black text-red-600">${totalPrice.toLocaleString()}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => setScreen('formulario')}
                  className="py-4 px-6 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                >
                  <Edit3 className="w-5 h-5" /> Editar Datos
                </button>
                <button
                  disabled={!isFormValid || isSending}
                  onClick={async () => {
                    addLog("Iniciando envío de pedido...");
                    setIsSending(true);
                    setSubmitError(null);
                    setSendingStatus("Preparando envío...");
                    
                    // Timeout de seguridad de 45 segundos
                    const timeoutId = setTimeout(() => {
                      if (isSending) {
                        setIsSending(false);
                        setSendingStatus(null);
                        addLog("TIMEOUT: El envío tardó más de 45s");
                        setSubmitError("El envío está tardando demasiado. Por favor, intenta de nuevo o verifica tu conexión.");
                      }
                    }, 45000);

                    try {
                      const uploadFormData = new FormData();
                      if (formData.archivo) {
                        uploadFormData.append('archivo', formData.archivo);
                      }

                      const orderData = {
                        nombre: formData.nombre,
                        cedula: formData.cedula,
                        celular: formData.celular,
                        correo: formData.correo,
                        cuotas: formData.cuotas,
                        entregaTipo: formData.entregaTipo,
                        sede: formData.entregaTipo === 'sede' ? formData.sede : null,
                        ciudad: formData.entregaTipo === 'domicilio' ? formData.ciudad : null,
                        direccion: formData.entregaTipo === 'domicilio' ? formData.direccion : null,
                        barrio: formData.entregaTipo === 'domicilio' ? formData.barrio : null,
                        localidad: formData.entregaTipo === 'domicilio' ? formData.localidad : null,
                        productos: selectedProducts.map(p => ({
                          id: p.id,
                          name: p.name,
                          price: p.price,
                          quantity: cart[p.id]
                        })),
                        subtotal,
                        costoEnvio,
                        total: totalPrice,
                        createdAt: new Date().toISOString()
                      };

                      uploadFormData.append('orderData', JSON.stringify(orderData));

                      setSendingStatus("Enviando pedido por correo...");
                      addLog("Enviando datos al servidor de correo...");

                      const response = await fetch('/api/send-order', {
                        method: 'POST',
                        body: uploadFormData,
                      });

                      const contentType = response.headers.get("content-type");
                      let result;
                      
                      if (contentType && contentType.includes("application/json")) {
                        result = await response.json();
                      } else {
                        const text = await response.text();
                        console.error("Respuesta no JSON del servidor:", text);
                        throw new Error(`El servidor respondió con un formato inesperado (HTML/Texto). Esto suele indicar un error 404 o 500 en el servidor.`);
                      }

                      if (!response.ok) {
                        throw new Error(result.error || result.details || 'Error al enviar el correo');
                      }

                      addLog(`¡Éxito! Pedido enviado. ID: ${result.messageId}`);
                      addLog(`Enviado a: ${result.recipient}`);
                      clearTimeout(timeoutId);
                      setSendingStatus(null);
                      setScreen('exito');
                      setCart({});
                      setFormData({
                        nombre: '', cedula: '', celular: '', correo: '', cuotas: 1, archivo: null,
                        entregaTipo: 'sede', sede: SEDES[0], ciudad: CIUDADES[0], direccion: '', barrio: '', localidad: ''
                      });
                    } catch (error: any) {
                      clearTimeout(timeoutId);
                      setSendingStatus(null);
                      addLog(`ERROR: ${error.message}`);
                      setSubmitError(error.message || "Error al enviar el pedido.");
                    } finally {
                      setIsSending(false);
                    }
                  }}
                  className="py-4 px-6 bg-[#1a1a1a] text-white rounded-2xl font-bold hover:bg-black transition-all active:scale-95 shadow-lg shadow-gray-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                  {isSending ? 'Enviando...' : 'Enviar Pedido'}
                </button>

                {submitError && (
                  <p className="text-red-500 text-sm font-bold text-center mt-2">
                    {submitError}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
        {screen === 'exito' && (
          <motion.div
            key="exito"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="min-h-[80vh] flex items-center justify-center p-6"
          >
            <div className="bg-white p-12 rounded-[3rem] shadow-2xl max-w-lg text-center space-y-8 border border-gray-50">
              <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-12 h-12 text-green-500" />
              </div>
              <div className="space-y-4">
                <h2 className="text-4xl font-black text-[#1a1a1a]">¡Misión Cumplida, Coleccionista!</h2>
                <p className="text-lg text-gray-600 leading-relaxed">
                  Tu pedido está en camino. ¡Prepárate para abrir esos sobres y completar tu álbum!
                </p>
              </div>
              <button
                onClick={() => setScreen('inicio')}
                className="w-full py-4 bg-[#1a1a1a] text-white rounded-2xl font-bold text-lg hover:bg-black transition-all active:scale-95"
              >
                Volver al Inicio
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer / Pie de Página */}
      <footer className="mt-20">
        <div className="w-full bg-[#e11d48] py-16 px-6">
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
            {/* Lado Izquierdo: Fonclaro */}
            <div className="flex flex-col items-center md:items-start gap-6 text-center md:text-left border-b md:border-b-0 md:border-r border-white/20 pb-12 md:pb-0 md:pr-12">
              <img 
                src="https://lh3.googleusercontent.com/d/1QBZC1Sx4puaHFmYPLtvAJnSJQvJkdtuW"
                alt="Logo Fonclaro Corporativo"
                referrerPolicy="no-referrer"
                className="h-20 w-auto brightness-0 invert"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://fonclaro.com/wp-content/themes/fontelmex/images/logo.png";
                }}
              />
              <div className="text-white space-y-2">
                <h4 className="text-xl font-black uppercase tracking-tighter">FONCLARO CORPORATIVO</h4>
                <p className="text-white/90 font-medium italic">"La prioridad eres tú"</p>
                <p className="text-white/70 text-sm max-w-xs">
                  Beneficios exclusivos para nuestros aficionados coleccionistas.
                </p>
              </div>
            </div>

            {/* Lado Derecho: Maranba */}
            <div className="flex flex-col items-center md:items-start gap-6 text-center md:text-left">
              <div className="text-white space-y-4">
                <div>
                  <h4 className="text-xl font-black uppercase tracking-tighter">MARANBA</h4>
                  <p className="text-white/90 font-bold text-sm">Distribuidor oficial Panini autorizado</p>
                </div>
                
                <div className="space-y-1 text-sm text-white/80">
                  <p className="font-bold text-white mb-2">Contacto:</p>
                  <p>Mario A. Blanco A.</p>
                  <p className="flex items-center justify-center md:justify-start gap-2">
                    <Phone className="w-4 h-4" /> 315 291 7199
                  </p>
                  <p className="flex items-center justify-center md:justify-start gap-2">
                    <Mail className="w-4 h-4" /> mario.blanco@maranba.com
                  </p>
                  <p className="flex items-center justify-center md:justify-start gap-2 ml-6">
                    panini@maranba.com
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="w-full h-24 bg-gray-100 flex items-center justify-center overflow-hidden border-t border-gray-200">
           <img 
             src="https://picsum.photos/seed/panini-footer-v2/1920/200?grayscale&blur=2" 
             alt="Footer Background" 
             className="w-full h-full object-cover opacity-20"
           />
        </div>
      </footer>
    </div>
  );
}
