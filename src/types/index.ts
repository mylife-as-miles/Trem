export interface NavItem {
  id: string;
  label: string;
  icon: string;
  type: 'process' | 'repo' | 'agent';
  status?: 'active' | 'idle' | 'warning' | 'success';
}

export interface StatusCardProps {
  id: string;
  title: string;
  value: string;
  subValue: string;
  icon: string;
  color: 'primary' | 'purple' | 'slate';
  progress?: number;
  status: 'active' | 'idle';
}

export interface Task {
  id: string;
  title: string;
  repo: string;
  time: string;
  status: 'processing' | 'completed' | 'failed';
  icon: string;
  color: 'primary' | 'purple' | 'red';
}

export interface CubeProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  color?: string;
  size?: number;
  scale?: number;
  iconType?: string;
  type?: string;
  wireframe?: boolean;
  userData?: { id: string };
}