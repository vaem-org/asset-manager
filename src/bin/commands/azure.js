import sywac from 'sywac';
import { deleteEncoders, init } from '@/util/azure-instances';

sywac.command('azure cleanup', async () => {
  await init();
  await deleteEncoders();
});